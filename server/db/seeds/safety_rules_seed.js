/**
 * Safety Rules Seed Module
 *
 * This module populates the database with default safety configuration for SafeChat.
 * It seeds four categories of safety data that enable the content moderation and
 * escalation features to work out-of-the-box.
 *
 * Seeded Data:
 * 1. Regex Patterns - Prompt injection detection patterns
 * 2. Escalation Settings - Human review triggers by category
 * 3. Moderation Settings - OpenAI moderation API thresholds
 * 4. System Settings - Global configuration values
 *
 * Idempotent Operations:
 * - Uses INSERT ... ON CONFLICT to safely run multiple times
 * - Existing data is updated rather than duplicated
 * - Safe to run on both fresh and existing databases
 *
 * Running the Seed:
 * - Import and call seedSafetyRules() programmatically
 * - Or run directly: node server/db/seeds/safety_rules_seed.js
 *
 * @module db/seeds/safety_rules_seed
 */

import sql from '../index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT INJECTION PATTERNS
// Regex patterns that detect attempts to manipulate the AI
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default regex patterns for detecting prompt injection attacks.
 *
 * These patterns are derived from common prompt injection techniques
 * documented in security research. They detect:
 *
 * Category: 'injection' - Attempts to override system instructions
 * - "Ignore previous instructions"
 * - "You are now a..."
 * - System prompt markers
 *
 * Category: 'extraction' - Attempts to extract system prompts
 * - "Reveal your prompt"
 * - "What are your instructions"
 *
 * Category: 'bypass' - Attempts to disable safety measures
 * - "Jailbreak"
 * - "Developer mode"
 * - "Ignore safety"
 *
 * All patterns are case-insensitive when matched by the rule engine.
 * The \s+ matches one or more whitespace characters for flexibility.
 */
const DEFAULT_REGEX_PATTERNS = [
  // ─────────────────────────────────────────────────────────────────────────────
  // INSTRUCTION OVERRIDE ATTEMPTS
  // Users trying to make the AI ignore its base instructions
  // ─────────────────────────────────────────────────────────────────────────────
  { value: 'ignore\\s+(all\\s+)?(previous|prior|above)\\s+(instructions?|prompts?|rules?)', category: 'injection', description: 'Ignore previous instructions pattern' },
  { value: 'disregard\\s+(all\\s+)?(previous|prior|your)\\s+(instructions?|prompts?|rules?)', category: 'injection', description: 'Disregard instructions pattern' },
  { value: 'forget\\s+(all\\s+)?(previous|prior|your)\\s+(instructions?|prompts?)', category: 'injection', description: 'Forget instructions pattern' },

  // ─────────────────────────────────────────────────────────────────────────────
  // IDENTITY MANIPULATION ATTEMPTS
  // Users trying to change the AI's identity/role
  // ─────────────────────────────────────────────────────────────────────────────
  { value: 'you\\s+are\\s+now\\s+(a|an|the)', category: 'injection', description: 'Identity override pattern' },
  { value: 'pretend\\s+(you\\s+are|to\\s+be|you\'re)', category: 'injection', description: 'Pretend pattern' },
  { value: 'act\\s+as\\s+(if\\s+you\\s+are|a|an)', category: 'injection', description: 'Act as pattern' },
  { value: 'roleplay\\s+as', category: 'injection', description: 'Roleplay pattern' },
  { value: 'new\\s+persona', category: 'injection', description: 'New persona pattern' },

  // ─────────────────────────────────────────────────────────────────────────────
  // SYSTEM PROMPT INJECTION ATTEMPTS
  // Users trying to inject fake system-level commands
  // ─────────────────────────────────────────────────────────────────────────────
  { value: 'system\\s*:\\s*', category: 'injection', description: 'System prompt injection' },
  { value: '\\[system\\]', category: 'injection', description: 'System tag injection' },
  { value: '<system>', category: 'injection', description: 'System XML injection' },

  // ─────────────────────────────────────────────────────────────────────────────
  // PROMPT EXTRACTION ATTEMPTS
  // Users trying to reveal the system prompt
  // ─────────────────────────────────────────────────────────────────────────────
  { value: 'reveal\\s+(your|the)\\s+(system\\s+)?(prompt|instructions?)', category: 'extraction', description: 'Reveal prompt pattern' },
  { value: 'show\\s+(me\\s+)?(your|the)\\s+(system\\s+)?(prompt|instructions?)', category: 'extraction', description: 'Show prompt pattern' },
  { value: 'what\\s+(are|is)\\s+your\\s+(system\\s+)?(prompt|instructions?)', category: 'extraction', description: 'What is prompt pattern' },
  { value: 'output\\s+(your|the)\\s+(initial|system)\\s+(prompt|instructions?)', category: 'extraction', description: 'Output prompt pattern' },
  { value: 'print\\s+(your|the)\\s+(system\\s+)?(prompt|instructions?)', category: 'extraction', description: 'Print prompt pattern' },
  { value: 'repeat\\s+(your|the)\\s+(system\\s+)?(prompt|instructions?)', category: 'extraction', description: 'Repeat prompt pattern' },

  // ─────────────────────────────────────────────────────────────────────────────
  // SAFETY BYPASS ATTEMPTS
  // Users trying to disable safety features
  // ─────────────────────────────────────────────────────────────────────────────
  { value: 'ignore\\s+safety', category: 'bypass', description: 'Ignore safety pattern' },
  { value: 'bypass\\s+(safety|filters?|restrictions?)', category: 'bypass', description: 'Bypass safety pattern' },
  { value: 'jailbreak', category: 'bypass', description: 'Jailbreak keyword' },
  { value: 'DAN\\s*mode', category: 'bypass', description: 'DAN mode pattern' },
  { value: 'developer\\s*mode', category: 'bypass', description: 'Developer mode pattern' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ESCALATION SETTINGS
// Configuration for when conversations should be escalated to humans
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default escalation category configurations.
 *
 * Each category defines:
 * - Keywords that trigger escalation when detected
 * - A response template shown to users
 * - Priority for queue ordering (higher = more urgent)
 *
 * Categories are ordered by priority:
 * 1. Crisis (100) - Mental health emergencies, highest priority
 * 2. Legal (80) - Legal threats requiring legal team review
 * 3. Complaint (60) - Customer complaints requesting human contact
 * 4. Sentiment (40) - Strong negative sentiment
 *
 * Keywords are matched case-insensitively and can be partial matches.
 * The response_template is sent to users when escalation triggers.
 */
const DEFAULT_ESCALATION_SETTINGS = [
  // ─────────────────────────────────────────────────────────────────────────────
  // CRISIS ESCALATION (Priority: 100 - HIGHEST)
  // Mental health emergencies requiring immediate attention
  // ─────────────────────────────────────────────────────────────────────────────
  {
    category: 'crisis',
    enabled: true,
    priority: 100,  // Highest priority - these go to front of queue
    keywords: [
      'suicid', 'kill myself', 'kill me', 'end my life', 'end it all', 'take my life', 'take my own life',
      'self-harm', 'selfharm', 'cutting myself', 'cut myself', 'hurting myself', 'hurt myself',
      'want to die', 'dont want to live', 'don\'t want to live', 'better off dead',
      'overdose', 'od on', 'pills to end', 'pills to die'
    ],
    response_template: "I'm very concerned about what you've shared. Your wellbeing is important. Please reach out to a crisis helpline - they're available 24/7 and want to help."
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LEGAL ESCALATION (Priority: 80)
  // Legal threats or mentions requiring legal team review
  // ─────────────────────────────────────────────────────────────────────────────
  {
    category: 'legal',
    enabled: true,
    priority: 80,
    keywords: [
      'lawyer', 'attorney', 'legal action', 'legal counsel', 'legal team',
      'lawsuit', 'sue', 'suing', 'litigation', 'court',
      'class action', 'legal proceedings'
    ],
    response_template: "I understand you have legal concerns. I'm going to connect you with a member of our team who can better assist with this matter. A representative will review your conversation and reach out shortly."
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // COMPLAINT ESCALATION (Priority: 60)
  // Customers explicitly requesting human contact or filing complaints
  // ─────────────────────────────────────────────────────────────────────────────
  {
    category: 'complaint',
    enabled: true,
    priority: 60,
    keywords: [
      'speak to manager', 'speak with manager', 'speak to supervisor', 'speak to human', 'speak to person', 'speak to agent',
      'escalate', 'escalation', 'complaint', 'complain',
      'report this', 'report you', 'file a complaint',
      'unacceptable', 'outrageous', 'ridiculous', 'terrible service',
      'bbb', 'better business bureau', 'consumer protection'
    ],
    response_template: "I understand you'd like to speak with someone from our team. I've flagged this conversation for review, and a human agent will follow up with you."
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SENTIMENT ESCALATION (Priority: 40)
  // Strong negative sentiment indicating dissatisfaction
  // ─────────────────────────────────────────────────────────────────────────────
  {
    category: 'sentiment',
    enabled: true,
    priority: 40,
    keywords: [
      'angry', 'furious', 'livid', 'outraged', 'disgusted',
      'worst', 'terrible', 'horrible', 'awful', 'pathetic',
      'hate', 'despise', 'loathe',
      'never again', 'never buying', 'never using', 'never recommending',
      'waste of time', 'waste of money'
    ],
    response_template: "I can see you're frustrated, and I'm sorry for any inconvenience. I've noted your concerns and flagged this for follow-up by our team."
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// MODERATION SETTINGS
// Per-category thresholds for OpenAI's moderation API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default moderation thresholds for OpenAI's 13 moderation categories.
 *
 * Threshold Guidelines:
 * - 0.1: Very sensitive (low confidence needed to trigger)
 * - 0.3: Sensitive (used for dangerous content like self-harm)
 * - 0.5: Moderate (used for threatening content)
 * - 0.7: Standard (balanced for most categories)
 * - 0.8: Less sensitive (allows borderline content)
 *
 * Special Cases:
 * - sexual/minors: Lowest threshold (0.1) - zero tolerance policy
 * - self-harm/*: Low threshold (0.3-0.5) - safety priority
 * - hate/threatening: Lower threshold (0.5) - violence prevention
 *
 * All categories default to 'block' action which prevents the message
 * from being processed and returns a fallback response.
 */
const DEFAULT_MODERATION_SETTINGS = [
  // Hate speech categories
  { category: 'hate', enabled: true, threshold: 0.7, action: 'block' },
  { category: 'hate/threatening', enabled: true, threshold: 0.5, action: 'block' },

  // Harassment categories
  { category: 'harassment', enabled: true, threshold: 0.7, action: 'block' },
  { category: 'harassment/threatening', enabled: true, threshold: 0.5, action: 'block' },

  // Self-harm categories (lower thresholds for safety)
  { category: 'self-harm', enabled: true, threshold: 0.5, action: 'block' },
  { category: 'self-harm/intent', enabled: true, threshold: 0.3, action: 'block' },
  { category: 'self-harm/instructions', enabled: true, threshold: 0.3, action: 'block' },

  // Sexual content categories
  { category: 'sexual', enabled: true, threshold: 0.8, action: 'block' },
  { category: 'sexual/minors', enabled: true, threshold: 0.1, action: 'block' },  // Zero tolerance

  // Violence categories
  { category: 'violence', enabled: true, threshold: 0.7, action: 'block' },
  { category: 'violence/graphic', enabled: true, threshold: 0.7, action: 'block' },

  // Illicit activity categories
  { category: 'illicit', enabled: true, threshold: 0.7, action: 'block' },
  { category: 'illicit/violent', enabled: true, threshold: 0.5, action: 'block' }
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS
// Global application configuration values
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default system-wide configuration settings.
 *
 * These settings control global behavior of the application:
 *
 * - rate_limit_messages: How many messages per minute per session
 * - session_timeout: How long before idle sessions expire
 * - safety_enabled: Toggle for individual safety layer components
 * - fallback_to_defaults: Use hardcoded defaults if DB unavailable
 * - cache_ttl: How long to cache rules before refreshing from DB
 *
 * All values are stored as JSON to support complex configuration objects.
 */
const DEFAULT_SYSTEM_SETTINGS = [
  {
    key: 'rate_limit_messages',
    value: { max: 10, windowMs: 60000 },
    description: 'Rate limit for messages per minute'
  },
  {
    key: 'session_timeout',
    value: { idleMs: 1800000 },  // 30 minutes
    description: 'Session idle timeout in milliseconds'
  },
  {
    key: 'safety_enabled',
    value: { moderation: true, sanitization: true, escalation: true, rag: true },
    description: 'Toggle for safety layer features'
  },
  {
    key: 'fallback_to_defaults',
    value: { enabled: true },
    description: 'Use hardcoded defaults if database rules unavailable'
  },
  {
    key: 'cache_ttl',
    value: { ms: 300000 },  // 5 minutes
    description: 'Rule cache time-to-live in milliseconds (5 minutes)'
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// SEED FUNCTION
// Main function that populates all safety configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Seed all safety rules and configuration into the database.
 *
 * This function is idempotent - it can be run multiple times safely.
 * Existing data is updated rather than duplicated using ON CONFLICT clauses.
 *
 * Operations performed:
 * 1. Insert regex patterns into safety_rules table
 * 2. Insert/update escalation settings
 * 3. Insert/update moderation settings
 * 4. Insert/update system settings
 *
 * @returns {Promise<void>}
 * @throws {Error} If database operations fail
 *
 * @example
 * // Run programmatically
 * import { seedSafetyRules } from './db/seeds/safety_rules_seed.js';
 * await seedSafetyRules();
 *
 * @example
 * // Run from command line
 * // node server/db/seeds/safety_rules_seed.js
 */
export async function seedSafetyRules() {
  console.log('Seeding safety rules...');

  // ─────────────────────────────────────────────────────────────────────────────
  // SEED REGEX PATTERNS
  // Insert prompt injection detection patterns
  // ON CONFLICT DO NOTHING prevents duplicates
  // ─────────────────────────────────────────────────────────────────────────────
  for (const pattern of DEFAULT_REGEX_PATTERNS) {
    await sql`
      INSERT INTO safety_rules (rule_type, category, value, action, priority, enabled, description, created_by)
      VALUES ('regex_pattern', ${pattern.category}, ${pattern.value}, 'block', 10, true, ${pattern.description}, 'system_seed')
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`  - Seeded ${DEFAULT_REGEX_PATTERNS.length} regex patterns`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SEED ESCALATION SETTINGS
  // Insert/update escalation category configurations
  // ON CONFLICT updates existing categories with new data
  // ─────────────────────────────────────────────────────────────────────────────
  for (const setting of DEFAULT_ESCALATION_SETTINGS) {
    await sql`
      INSERT INTO escalation_settings (category, enabled, keywords, response_template, priority)
      VALUES (${setting.category}, ${setting.enabled}, ${setting.keywords}, ${setting.response_template}, ${setting.priority})
      ON CONFLICT (category) DO UPDATE SET
        keywords = ${setting.keywords},
        response_template = ${setting.response_template},
        priority = ${setting.priority}
    `;
  }
  console.log(`  - Seeded ${DEFAULT_ESCALATION_SETTINGS.length} escalation settings`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SEED MODERATION SETTINGS
  // Insert/update OpenAI moderation category thresholds
  // ─────────────────────────────────────────────────────────────────────────────
  for (const setting of DEFAULT_MODERATION_SETTINGS) {
    await sql`
      INSERT INTO moderation_settings (category, enabled, threshold, action)
      VALUES (${setting.category}, ${setting.enabled}, ${setting.threshold}, ${setting.action})
      ON CONFLICT (category) DO UPDATE SET
        enabled = ${setting.enabled},
        threshold = ${setting.threshold},
        action = ${setting.action}
    `;
  }
  console.log(`  - Seeded ${DEFAULT_MODERATION_SETTINGS.length} moderation settings`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SEED SYSTEM SETTINGS
  // Insert/update global configuration values
  // ─────────────────────────────────────────────────────────────────────────────
  for (const setting of DEFAULT_SYSTEM_SETTINGS) {
    await sql`
      INSERT INTO system_settings (key, value, description)
      VALUES (${setting.key}, ${JSON.stringify(setting.value)}, ${setting.description})
      ON CONFLICT (key) DO UPDATE SET
        value = ${JSON.stringify(setting.value)},
        description = ${setting.description}
    `;
  }
  console.log(`  - Seeded ${DEFAULT_SYSTEM_SETTINGS.length} system settings`);

  console.log('Safety rules seeding complete!');
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECT EXECUTION
// Allow running this file directly from command line
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if this module is being run directly (not imported).
 * If so, execute the seed function and exit.
 *
 * This pattern allows the file to be both:
 * - Imported as a module: import { seedSafetyRules } from '...'
 * - Run directly: node safety_rules_seed.js
 */
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedSafetyRules()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

export default seedSafetyRules;
