/**
 * Rule Engine Service
 *
 * This service provides dynamic, database-driven safety rules for the SafeChat system.
 * It allows administrators to modify safety rules (blocked keywords, regex patterns,
 * escalation triggers, moderation thresholds) through the admin dashboard without
 * requiring code deployments.
 *
 * Key Features:
 * - Database-backed rules with admin UI for management
 * - In-memory caching with configurable TTL (default 5 minutes) for performance
 * - Automatic fallback to hardcoded defaults if database is unavailable
 * - Singleton pattern ensures consistent caching across the application
 *
 * Rule Types:
 * - Regex Patterns: For detecting prompt injection and other patterns
 * - Blocked Keywords: Simple keyword matching for prohibited content
 * - Escalation Keywords: Trigger human review based on content category
 * - Moderation Thresholds: Per-category score thresholds for OpenAI moderation
 *
 * @module services/ruleEngine
 */

import { logger } from '../middleware/errorHandler.js';
import {
  getActiveBlockedKeywords,
  getActiveEscalationKeywords,
  getActiveRegexPatterns,
  getActiveModerationThresholds,
  getSystemSetting
} from '../db/safetyRules.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT FALLBACK RULES
// These are used when the database is unavailable or during initial startup.
// They provide baseline protection even if the dynamic rule system fails.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default regex patterns for detecting prompt injection attacks.
 * Each pattern attempts to identify common jailbreak/manipulation techniques.
 */
const DEFAULT_INJECTION_PATTERNS = [
  // Attempts to override system instructions
  { value: 'ignore\\s+(all\\s+)?(previous|prior|above)\\s+(instructions?|prompts?|rules?)', action: 'block' },
  { value: 'disregard\\s+(all\\s+)?(previous|prior|your)\\s+(instructions?|prompts?|rules?)', action: 'block' },
  { value: 'forget\\s+(all\\s+)?(previous|prior|your)\\s+(instructions?|prompts?)', action: 'block' },
  // Identity manipulation attempts
  { value: 'you\\s+are\\s+now\\s+(a|an|the)', action: 'block' },
  { value: 'pretend\\s+(you\\s+are|to\\s+be|you\'re)', action: 'block' },
  { value: 'act\\s+as\\s+(if\\s+you\\s+are|a|an)', action: 'block' },
  { value: 'roleplay\\s+as', action: 'block' },
  // System prompt injection attempts
  { value: 'system\\s*:\\s*', action: 'block' },
  // Known jailbreak techniques
  { value: 'jailbreak', action: 'block' },
  { value: 'DAN\\s*mode', action: 'block' },      // "Do Anything Now" jailbreak
  { value: 'developer\\s*mode', action: 'block' }
];

/**
 * Default keywords that trigger escalation to human review.
 * Organized by category with different urgency levels.
 */
const DEFAULT_ESCALATION_KEYWORDS = {
  crisis: ['suicid', 'kill myself', 'end my life', 'self-harm', 'want to die'],  // CRITICAL urgency
  legal: ['lawyer', 'attorney', 'lawsuit', 'sue', 'legal action'],                // HIGH urgency
  complaint: ['speak to manager', 'escalate', 'complaint', 'unacceptable'],       // MEDIUM urgency
  sentiment: ['angry', 'furious', 'worst', 'terrible', 'hate']                    // MEDIUM urgency
};

/**
 * Default thresholds for OpenAI moderation categories.
 * Scores range from 0 to 1; content exceeding threshold triggers action.
 * Lower thresholds = more sensitive (more content blocked).
 */
const DEFAULT_MODERATION_THRESHOLDS = {
  // Hate speech categories
  'hate': { threshold: 0.7, action: 'block' },
  'hate/threatening': { threshold: 0.5, action: 'block' },  // Lower threshold for threats
  // Harassment categories
  'harassment': { threshold: 0.7, action: 'block' },
  'harassment/threatening': { threshold: 0.5, action: 'block' },
  // Self-harm categories - lowest thresholds due to safety criticality
  'self-harm': { threshold: 0.5, action: 'block' },
  'self-harm/intent': { threshold: 0.3, action: 'block' },       // Very sensitive
  'self-harm/instructions': { threshold: 0.3, action: 'block' }, // Very sensitive
  // Sexual content categories
  'sexual': { threshold: 0.8, action: 'block' },
  'sexual/minors': { threshold: 0.3, action: 'block' },  // Zero tolerance, very low threshold
  // Violence categories
  'violence': { threshold: 0.7, action: 'block' },
  'violence/graphic': { threshold: 0.7, action: 'block' },
  // Illicit activity categories
  'illicit': { threshold: 0.7, action: 'block' },
  'illicit/violent': { threshold: 0.5, action: 'block' }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RULE ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * RuleEngine manages dynamic safety rules with caching and database fallback.
 *
 * This class implements the singleton pattern - only one instance exists
 * throughout the application lifecycle to ensure consistent caching.
 *
 * Cache Strategy:
 * - Rules are cached in memory for performance (avoids DB queries on every message)
 * - Cache TTL is configurable via admin settings (default: 5 minutes)
 * - Cache can be manually invalidated when rules are updated
 * - If DB is unavailable, falls back to hardcoded defaults
 */
class RuleEngine {
  /**
   * Initialize the rule engine with empty caches.
   */
  constructor() {
    // Cache stores the actual rule data once loaded from database
    this.cache = {
      regexPatterns: null,        // Compiled RegExp objects for pattern matching
      blockedKeywords: null,      // Array of blocked keyword strings
      escalationKeywords: null,   // Map of category -> keyword arrays
      moderationThresholds: null  // Map of category -> {threshold, action}
    };
    // Tracks when each cache entry expires
    this.cacheExpiry = {
      regexPatterns: null,
      blockedKeywords: null,
      escalationKeywords: null,
      moderationThresholds: null
    };
    this.cacheTTL = 5 * 60 * 1000;  // Default: 5 minutes (configurable via admin)
    this.usingFallback = false;      // True if currently using hardcoded defaults
  }

  /**
   * Fetch the configured cache TTL from system settings.
   * Falls back to default if setting cannot be retrieved.
   * @returns {Promise<number>} Cache TTL in milliseconds
   */
  async getCacheTTL() {
    try {
      const setting = await getSystemSetting('cache_ttl');
      if (setting?.value?.ms) {
        return setting.value.ms;
      }
    } catch (err) {
      // Database unavailable - use default TTL
    }
    return this.cacheTTL;
  }

  /**
   * Check if a specific cache entry is still valid (not expired).
   * @param {string} key - Cache key to check
   * @returns {boolean} True if cache entry exists and hasn't expired
   */
  isCacheValid(key) {
    return this.cache[key] !== null &&
           this.cacheExpiry[key] !== null &&
           Date.now() < this.cacheExpiry[key];
  }

  /**
   * Store data in cache with expiration timestamp.
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   */
  setCache(key, data) {
    this.cache[key] = data;
    this.cacheExpiry[key] = Date.now() + this.cacheTTL;
  }

  /**
   * Clear all cached rules.
   * Call this when rules are updated via admin dashboard to force reload.
   */
  invalidateCache() {
    logger.info('Invalidating rule engine cache');
    this.cache = {
      regexPatterns: null,
      blockedKeywords: null,
      escalationKeywords: null,
      moderationThresholds: null
    };
    this.cacheExpiry = {
      regexPatterns: null,
      blockedKeywords: null,
      escalationKeywords: null,
      moderationThresholds: null
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RULE RETRIEVAL METHODS
  // Each method follows the same pattern:
  // 1. Check if cache is valid → return cached data
  // 2. Try to load from database → cache and return
  // 3. If database fails → return fallback defaults
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get compiled regex patterns for prompt injection detection.
   * @returns {Promise<Array<{regex: RegExp, action: string, category: string}>>}
   */
  async getRegexPatterns() {
    // Return cached patterns if available and not expired
    if (this.isCacheValid('regexPatterns')) {
      return this.cache.regexPatterns;
    }

    try {
      // Load patterns from database
      const patterns = await getActiveRegexPatterns();

      // Compile each pattern string into a RegExp object
      // Invalid patterns are logged and filtered out
      const compiled = patterns.map(p => {
        try {
          return {
            regex: new RegExp(p.value, 'i'),  // Case-insensitive matching
            action: p.action,
            category: p.category,
            original: p.value  // Keep original for debugging
          };
        } catch (err) {
          logger.warn(`Invalid regex pattern: ${p.value}`);
          return null;  // Will be filtered out
        }
      }).filter(Boolean);  // Remove null entries from invalid patterns

      this.setCache('regexPatterns', compiled);
      this.usingFallback = false;
      return compiled;
    } catch (err) {
      // Database error - fall back to hardcoded defaults
      logger.error({ message: 'Failed to load regex patterns from DB, using fallback', error: err.message });
      this.usingFallback = true;

      // Compile and return default patterns
      return DEFAULT_INJECTION_PATTERNS.map(p => ({
        regex: new RegExp(p.value, 'i'),
        action: p.action,
        category: 'injection',
        original: p.value
      }));
    }
  }

  /**
   * Get list of blocked keywords for simple string matching.
   * @returns {Promise<Array<string>>} Array of blocked keyword strings
   */
  async getBlockedKeywords() {
    if (this.isCacheValid('blockedKeywords')) {
      return this.cache.blockedKeywords;
    }

    try {
      const keywords = await getActiveBlockedKeywords();
      this.setCache('blockedKeywords', keywords);
      this.usingFallback = false;
      return keywords;
    } catch (err) {
      logger.error({ message: 'Failed to load blocked keywords from DB', error: err.message });
      this.usingFallback = true;
      return [];  // No default blocked keywords - rely on regex patterns
    }
  }

  /**
   * Get escalation keywords organized by category.
   * @returns {Promise<Object>} Map of category -> keyword array
   *   Example: { crisis: ['suicid', 'kill myself'], legal: ['lawyer', 'lawsuit'] }
   */
  async getEscalationKeywords() {
    if (this.isCacheValid('escalationKeywords')) {
      return this.cache.escalationKeywords;
    }

    try {
      const settings = await getActiveEscalationKeywords();

      // Transform database rows into a category -> keywords map
      const keywordMap = {};
      for (const setting of settings) {
        keywordMap[setting.category] = setting.keywords || [];
      }

      this.setCache('escalationKeywords', keywordMap);
      this.usingFallback = false;
      return keywordMap;
    } catch (err) {
      logger.error({ message: 'Failed to load escalation keywords from DB, using fallback', error: err.message });
      this.usingFallback = true;
      return DEFAULT_ESCALATION_KEYWORDS;
    }
  }

  /**
   * Get moderation thresholds per OpenAI moderation category.
   * @returns {Promise<Object>} Map of category -> {threshold, action}
   *   Example: { 'self-harm': { threshold: 0.5, action: 'block' } }
   */
  async getModerationThresholds() {
    if (this.isCacheValid('moderationThresholds')) {
      return this.cache.moderationThresholds;
    }

    try {
      const settings = await getActiveModerationThresholds();

      // Transform database rows into a category -> settings map
      const thresholdMap = {};
      for (const setting of settings) {
        thresholdMap[setting.category] = {
          threshold: parseFloat(setting.threshold),
          action: setting.action
        };
      }

      this.setCache('moderationThresholds', thresholdMap);
      this.usingFallback = false;
      return thresholdMap;
    } catch (err) {
      logger.error({ message: 'Failed to load moderation thresholds from DB, using fallback', error: err.message });
      this.usingFallback = true;
      return DEFAULT_MODERATION_THRESHOLDS;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MATCHING METHODS
  // These methods check input text against the loaded rules
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Test input text against all active regex patterns.
   * Returns on first match (patterns are ordered by priority).
   *
   * @param {string} text - Input text to check
   * @returns {Promise<Object>} Match result:
   *   - matched {boolean} - True if any pattern matched
   *   - pattern {string} - The matching pattern (if matched)
   *   - action {string} - Action to take (block, flag, etc.)
   *   - category {string} - Pattern category (injection, bypass, etc.)
   */
  async matchRegexPatterns(text) {
    const patterns = await this.getRegexPatterns();

    // Test each pattern until we find a match
    for (const pattern of patterns) {
      if (pattern.regex.test(text)) {
        return {
          matched: true,
          pattern: pattern.original,
          action: pattern.action,
          category: pattern.category
        };
      }
    }

    return { matched: false };
  }

  /**
   * Check text against list of blocked keywords (case-insensitive).
   *
   * @param {string} text - Input text to check
   * @returns {Promise<Object>} Match result:
   *   - matched {boolean} - True if any keyword found
   *   - keyword {string} - The matching keyword (if matched)
   */
  async matchBlockedKeywords(text) {
    const keywords = await this.getBlockedKeywords();
    const lowerText = text.toLowerCase();

    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return {
          matched: true,
          keyword
        };
      }
    }

    return { matched: false };
  }

  /**
   * Check text against escalation keywords across all categories.
   * Unlike other match methods, this returns ALL matches (not just first).
   *
   * @param {string} text - Input text to check
   * @returns {Promise<Object>} Match result:
   *   - matched {boolean} - True if any keywords found
   *   - matches {Array} - All matches with category and keyword
   */
  async matchEscalationKeywords(text) {
    const keywordMap = await this.getEscalationKeywords();
    const lowerText = text.toLowerCase();
    const matches = [];

    // Check all categories and collect all matches
    for (const [category, keywords] of Object.entries(keywordMap)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          matches.push({ category, keyword });
        }
      }
    }

    return {
      matched: matches.length > 0,
      matches
    };
  }

  /**
   * Determine if a moderation score should trigger an action.
   * Compares the score against the configured threshold for that category.
   *
   * @param {string} category - OpenAI moderation category (e.g., 'self-harm')
   * @param {number} score - Score from OpenAI (0 to 1)
   * @returns {Promise<Object>} Action determination:
   *   - shouldAct {boolean} - True if score exceeds threshold
   *   - action {string} - Action to take (block, flag, escalate)
   *   - threshold {number} - The threshold that was used
   */
  async getModerationAction(category, score) {
    const thresholds = await this.getModerationThresholds();
    const setting = thresholds[category];

    // If no custom setting exists, use conservative defaults
    if (!setting) {
      return { shouldAct: score > 0.7, action: 'flag' };
    }

    return {
      shouldAct: score >= setting.threshold,
      action: setting.action,
      threshold: setting.threshold
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DIAGNOSTICS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get current status of the rule engine for health checks and debugging.
   * Useful for admin dashboard to show rule engine health.
   *
   * @returns {Object} Status including fallback state and cache validity
   */
  getStatus() {
    return {
      usingFallback: this.usingFallback,  // True = database unavailable
      cacheStatus: {
        regexPatterns: this.isCacheValid('regexPatterns'),
        blockedKeywords: this.isCacheValid('blockedKeywords'),
        escalationKeywords: this.isCacheValid('escalationKeywords'),
        moderationThresholds: this.isCacheValid('moderationThresholds')
      },
      cacheTTL: this.cacheTTL
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// Only one instance of RuleEngine exists across the entire application.
// This ensures caching is consistent and prevents duplicate database queries.
// ═══════════════════════════════════════════════════════════════════════════════
const ruleEngine = new RuleEngine();

export default ruleEngine;
export { RuleEngine };
