import { logger } from '../middleware/errorHandler.js';
import {
  getActiveBlockedKeywords,
  getActiveEscalationKeywords,
  getActiveRegexPatterns,
  getActiveModerationThresholds,
  getSystemSetting
} from '../db/safetyRules.js';

// Default fallback rules (used when database is unavailable)
const DEFAULT_INJECTION_PATTERNS = [
  { value: 'ignore\\s+(all\\s+)?(previous|prior|above)\\s+(instructions?|prompts?|rules?)', action: 'block' },
  { value: 'disregard\\s+(all\\s+)?(previous|prior|your)\\s+(instructions?|prompts?|rules?)', action: 'block' },
  { value: 'forget\\s+(all\\s+)?(previous|prior|your)\\s+(instructions?|prompts?)', action: 'block' },
  { value: 'you\\s+are\\s+now\\s+(a|an|the)', action: 'block' },
  { value: 'pretend\\s+(you\\s+are|to\\s+be|you\'re)', action: 'block' },
  { value: 'act\\s+as\\s+(if\\s+you\\s+are|a|an)', action: 'block' },
  { value: 'roleplay\\s+as', action: 'block' },
  { value: 'system\\s*:\\s*', action: 'block' },
  { value: 'jailbreak', action: 'block' },
  { value: 'DAN\\s*mode', action: 'block' },
  { value: 'developer\\s*mode', action: 'block' }
];

const DEFAULT_ESCALATION_KEYWORDS = {
  crisis: ['suicid', 'kill myself', 'end my life', 'self-harm', 'want to die'],
  legal: ['lawyer', 'attorney', 'lawsuit', 'sue', 'legal action'],
  complaint: ['speak to manager', 'escalate', 'complaint', 'unacceptable'],
  sentiment: ['angry', 'furious', 'worst', 'terrible', 'hate']
};

const DEFAULT_MODERATION_THRESHOLDS = {
  'hate': { threshold: 0.7, action: 'block' },
  'harassment': { threshold: 0.7, action: 'block' },
  'self-harm': { threshold: 0.5, action: 'escalate' },
  'sexual': { threshold: 0.8, action: 'block' },
  'violence': { threshold: 0.8, action: 'flag' }
};

class RuleEngine {
  constructor() {
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
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes default
    this.usingFallback = false;
  }

  async getCacheTTL() {
    try {
      const setting = await getSystemSetting('cache_ttl');
      if (setting?.value?.ms) {
        return setting.value.ms;
      }
    } catch (err) {
      // Use default if can't fetch setting
    }
    return this.cacheTTL;
  }

  isCacheValid(key) {
    return this.cache[key] !== null &&
           this.cacheExpiry[key] !== null &&
           Date.now() < this.cacheExpiry[key];
  }

  setCache(key, data) {
    this.cache[key] = data;
    this.cacheExpiry[key] = Date.now() + this.cacheTTL;
  }

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

  async getRegexPatterns() {
    if (this.isCacheValid('regexPatterns')) {
      return this.cache.regexPatterns;
    }

    try {
      const patterns = await getActiveRegexPatterns();

      // Compile regex patterns
      const compiled = patterns.map(p => {
        try {
          return {
            regex: new RegExp(p.value, 'i'),
            action: p.action,
            category: p.category,
            original: p.value
          };
        } catch (err) {
          logger.warn(`Invalid regex pattern: ${p.value}`);
          return null;
        }
      }).filter(Boolean);

      this.setCache('regexPatterns', compiled);
      this.usingFallback = false;
      return compiled;
    } catch (err) {
      logger.error({ message: 'Failed to load regex patterns from DB, using fallback', error: err.message });
      this.usingFallback = true;

      // Return default patterns
      return DEFAULT_INJECTION_PATTERNS.map(p => ({
        regex: new RegExp(p.value, 'i'),
        action: p.action,
        category: 'injection',
        original: p.value
      }));
    }
  }

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
      return [];
    }
  }

  async getEscalationKeywords() {
    if (this.isCacheValid('escalationKeywords')) {
      return this.cache.escalationKeywords;
    }

    try {
      const settings = await getActiveEscalationKeywords();

      // Convert to map by category
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

  async getModerationThresholds() {
    if (this.isCacheValid('moderationThresholds')) {
      return this.cache.moderationThresholds;
    }

    try {
      const settings = await getActiveModerationThresholds();

      // Convert to map by category
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

  // Check text against regex patterns
  async matchRegexPatterns(text) {
    const patterns = await this.getRegexPatterns();

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

  // Check text against blocked keywords
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

  // Check text against escalation keywords
  async matchEscalationKeywords(text) {
    const keywordMap = await this.getEscalationKeywords();
    const lowerText = text.toLowerCase();
    const matches = [];

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

  // Get threshold and action for a moderation category
  async getModerationAction(category, score) {
    const thresholds = await this.getModerationThresholds();
    const setting = thresholds[category];

    if (!setting) {
      // Default behavior
      return { shouldAct: score > 0.7, action: 'flag' };
    }

    return {
      shouldAct: score >= setting.threshold,
      action: setting.action,
      threshold: setting.threshold
    };
  }

  // Health check for rule engine
  getStatus() {
    return {
      usingFallback: this.usingFallback,
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

// Singleton instance
const ruleEngine = new RuleEngine();

export default ruleEngine;
export { RuleEngine };
