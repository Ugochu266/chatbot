import sql from '../index.js';

// Default prompt injection patterns from sanitization.js
const DEFAULT_REGEX_PATTERNS = [
  { value: 'ignore\\s+(all\\s+)?(previous|prior|above)\\s+(instructions?|prompts?|rules?)', category: 'injection', description: 'Ignore previous instructions pattern' },
  { value: 'disregard\\s+(all\\s+)?(previous|prior|your)\\s+(instructions?|prompts?|rules?)', category: 'injection', description: 'Disregard instructions pattern' },
  { value: 'forget\\s+(all\\s+)?(previous|prior|your)\\s+(instructions?|prompts?)', category: 'injection', description: 'Forget instructions pattern' },
  { value: 'you\\s+are\\s+now\\s+(a|an|the)', category: 'injection', description: 'Identity override pattern' },
  { value: 'pretend\\s+(you\\s+are|to\\s+be|you\'re)', category: 'injection', description: 'Pretend pattern' },
  { value: 'act\\s+as\\s+(if\\s+you\\s+are|a|an)', category: 'injection', description: 'Act as pattern' },
  { value: 'roleplay\\s+as', category: 'injection', description: 'Roleplay pattern' },
  { value: 'new\\s+persona', category: 'injection', description: 'New persona pattern' },
  { value: 'system\\s*:\\s*', category: 'injection', description: 'System prompt injection' },
  { value: '\\[system\\]', category: 'injection', description: 'System tag injection' },
  { value: '<system>', category: 'injection', description: 'System XML injection' },
  { value: 'reveal\\s+(your|the)\\s+(system\\s+)?(prompt|instructions?)', category: 'extraction', description: 'Reveal prompt pattern' },
  { value: 'show\\s+(me\\s+)?(your|the)\\s+(system\\s+)?(prompt|instructions?)', category: 'extraction', description: 'Show prompt pattern' },
  { value: 'what\\s+(are|is)\\s+your\\s+(system\\s+)?(prompt|instructions?)', category: 'extraction', description: 'What is prompt pattern' },
  { value: 'output\\s+(your|the)\\s+(initial|system)\\s+(prompt|instructions?)', category: 'extraction', description: 'Output prompt pattern' },
  { value: 'print\\s+(your|the)\\s+(system\\s+)?(prompt|instructions?)', category: 'extraction', description: 'Print prompt pattern' },
  { value: 'repeat\\s+(your|the)\\s+(system\\s+)?(prompt|instructions?)', category: 'extraction', description: 'Repeat prompt pattern' },
  { value: 'ignore\\s+safety', category: 'bypass', description: 'Ignore safety pattern' },
  { value: 'bypass\\s+(safety|filters?|restrictions?)', category: 'bypass', description: 'Bypass safety pattern' },
  { value: 'jailbreak', category: 'bypass', description: 'Jailbreak keyword' },
  { value: 'DAN\\s*mode', category: 'bypass', description: 'DAN mode pattern' },
  { value: 'developer\\s*mode', category: 'bypass', description: 'Developer mode pattern' },
];

// Default escalation settings from escalation.js
const DEFAULT_ESCALATION_SETTINGS = [
  {
    category: 'crisis',
    enabled: true,
    priority: 100,
    keywords: [
      'suicid', 'kill myself', 'kill me', 'end my life', 'end it all', 'take my life', 'take my own life',
      'self-harm', 'selfharm', 'cutting myself', 'cut myself', 'hurting myself', 'hurt myself',
      'want to die', 'dont want to live', 'don\'t want to live', 'better off dead',
      'overdose', 'od on', 'pills to end', 'pills to die'
    ],
    response_template: "I'm very concerned about what you've shared. Your wellbeing is important. Please reach out to a crisis helpline - they're available 24/7 and want to help."
  },
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

// Default moderation settings (OpenAI moderation categories)
const DEFAULT_MODERATION_SETTINGS = [
  { category: 'hate', enabled: true, threshold: 0.7, action: 'block' },
  { category: 'hate/threatening', enabled: true, threshold: 0.7, action: 'block' },
  { category: 'harassment', enabled: true, threshold: 0.7, action: 'block' },
  { category: 'harassment/threatening', enabled: true, threshold: 0.7, action: 'block' },
  { category: 'self-harm', enabled: true, threshold: 0.5, action: 'escalate' },
  { category: 'self-harm/intent', enabled: true, threshold: 0.5, action: 'escalate' },
  { category: 'self-harm/instructions', enabled: true, threshold: 0.7, action: 'block' },
  { category: 'sexual', enabled: true, threshold: 0.8, action: 'block' },
  { category: 'sexual/minors', enabled: true, threshold: 0.1, action: 'block' },
  { category: 'violence', enabled: true, threshold: 0.8, action: 'flag' },
  { category: 'violence/graphic', enabled: true, threshold: 0.7, action: 'block' }
];

// Default system settings
const DEFAULT_SYSTEM_SETTINGS = [
  { key: 'rate_limit_messages', value: { max: 10, windowMs: 60000 }, description: 'Rate limit for messages per minute' },
  { key: 'session_timeout', value: { idleMs: 1800000 }, description: 'Session idle timeout in milliseconds' },
  { key: 'safety_enabled', value: { moderation: true, sanitization: true, escalation: true, rag: true }, description: 'Toggle for safety layer features' },
  { key: 'fallback_to_defaults', value: { enabled: true }, description: 'Use hardcoded defaults if database rules unavailable' },
  { key: 'cache_ttl', value: { ms: 300000 }, description: 'Rule cache time-to-live in milliseconds (5 minutes)' }
];

export async function seedSafetyRules() {
  console.log('Seeding safety rules...');

  // Seed regex patterns as safety rules
  for (const pattern of DEFAULT_REGEX_PATTERNS) {
    await sql`
      INSERT INTO safety_rules (rule_type, category, value, action, priority, enabled, description, created_by)
      VALUES ('regex_pattern', ${pattern.category}, ${pattern.value}, 'block', 10, true, ${pattern.description}, 'system_seed')
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`  - Seeded ${DEFAULT_REGEX_PATTERNS.length} regex patterns`);

  // Seed escalation settings
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

  // Seed moderation settings
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

  // Seed system settings
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

// Run seed if called directly
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
