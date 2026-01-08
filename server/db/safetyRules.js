import sql from './index.js';

// ============================================
// Safety Rules CRUD
// ============================================

export async function getSafetyRules(filters = {}) {
  const { ruleType, category, enabled } = filters;

  let query = sql`
    SELECT * FROM safety_rules
    WHERE 1=1
  `;

  if (ruleType) {
    query = sql`${query} AND rule_type = ${ruleType}`;
  }
  if (category) {
    query = sql`${query} AND category = ${category}`;
  }
  if (enabled !== undefined) {
    query = sql`${query} AND enabled = ${enabled}`;
  }

  const results = await sql`
    SELECT * FROM safety_rules
    WHERE
      (${ruleType}::text IS NULL OR rule_type = ${ruleType})
      AND (${category}::text IS NULL OR category = ${category})
      AND (${enabled}::boolean IS NULL OR enabled = ${enabled})
    ORDER BY priority DESC, created_at DESC
  `;

  return results;
}

export async function getSafetyRuleById(id) {
  const result = await sql`
    SELECT * FROM safety_rules WHERE id = ${id}
  `;
  return result[0] || null;
}

export async function createSafetyRule(data) {
  const { ruleType, category, value, action, priority, enabled, description, createdBy } = data;

  const result = await sql`
    INSERT INTO safety_rules (rule_type, category, value, action, priority, enabled, description, created_by)
    VALUES (${ruleType}, ${category}, ${value}, ${action || 'block'}, ${priority || 0}, ${enabled !== false}, ${description}, ${createdBy})
    RETURNING *
  `;
  return result[0];
}

export async function updateSafetyRule(id, data) {
  const { ruleType, category, value, action, priority, enabled, description } = data;

  const result = await sql`
    UPDATE safety_rules
    SET
      rule_type = COALESCE(${ruleType}, rule_type),
      category = COALESCE(${category}, category),
      value = COALESCE(${value}, value),
      action = COALESCE(${action}, action),
      priority = COALESCE(${priority}, priority),
      enabled = COALESCE(${enabled}, enabled),
      description = COALESCE(${description}, description)
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0];
}

export async function deleteSafetyRule(id) {
  await sql`DELETE FROM safety_rules WHERE id = ${id}`;
}

export async function bulkCreateSafetyRules(rules) {
  const results = [];
  for (const rule of rules) {
    const created = await createSafetyRule(rule);
    results.push(created);
  }
  return results;
}

// Get rules by type for rule engine
export async function getRulesByType(ruleType) {
  const results = await sql`
    SELECT * FROM safety_rules
    WHERE rule_type = ${ruleType} AND enabled = true
    ORDER BY priority DESC
  `;
  return results;
}

// ============================================
// Moderation Settings CRUD
// ============================================

export async function getModerationSettings() {
  const results = await sql`
    SELECT * FROM moderation_settings
    ORDER BY category
  `;
  return results;
}

export async function getModerationSettingByCategory(category) {
  const result = await sql`
    SELECT * FROM moderation_settings WHERE category = ${category}
  `;
  return result[0] || null;
}

export async function upsertModerationSetting(data) {
  const { category, enabled, threshold, action } = data;

  const result = await sql`
    INSERT INTO moderation_settings (category, enabled, threshold, action)
    VALUES (${category}, ${enabled !== false}, ${threshold || 0.7}, ${action || 'block'})
    ON CONFLICT (category) DO UPDATE SET
      enabled = ${enabled !== false},
      threshold = ${threshold || 0.7},
      action = ${action || 'block'}
    RETURNING *
  `;
  return result[0];
}

export async function updateModerationSetting(category, data) {
  const { enabled, threshold, action } = data;

  const result = await sql`
    UPDATE moderation_settings
    SET
      enabled = COALESCE(${enabled}, enabled),
      threshold = COALESCE(${threshold}, threshold),
      action = COALESCE(${action}, action)
    WHERE category = ${category}
    RETURNING *
  `;
  return result[0];
}

// ============================================
// Escalation Settings CRUD
// ============================================

export async function getEscalationSettings() {
  const results = await sql`
    SELECT * FROM escalation_settings
    ORDER BY priority DESC, category
  `;
  return results;
}

export async function getEscalationSettingByCategory(category) {
  const result = await sql`
    SELECT * FROM escalation_settings WHERE category = ${category}
  `;
  return result[0] || null;
}

export async function upsertEscalationSetting(data) {
  const { category, enabled, keywords, responseTemplate, priority } = data;

  const result = await sql`
    INSERT INTO escalation_settings (category, enabled, keywords, response_template, priority)
    VALUES (${category}, ${enabled !== false}, ${keywords || []}, ${responseTemplate}, ${priority || 0})
    ON CONFLICT (category) DO UPDATE SET
      enabled = ${enabled !== false},
      keywords = ${keywords || []},
      response_template = ${responseTemplate},
      priority = ${priority || 0}
    RETURNING *
  `;
  return result[0];
}

export async function updateEscalationSetting(category, data) {
  const { enabled, keywords, responseTemplate, priority } = data;

  const result = await sql`
    UPDATE escalation_settings
    SET
      enabled = COALESCE(${enabled}, enabled),
      keywords = COALESCE(${keywords}, keywords),
      response_template = COALESCE(${responseTemplate}, response_template),
      priority = COALESCE(${priority}, priority)
    WHERE category = ${category}
    RETURNING *
  `;
  return result[0];
}

// ============================================
// System Settings CRUD
// ============================================

export async function getSystemSettings() {
  const results = await sql`
    SELECT * FROM system_settings
    ORDER BY key
  `;
  return results;
}

export async function getSystemSetting(key) {
  const result = await sql`
    SELECT * FROM system_settings WHERE key = ${key}
  `;
  return result[0] || null;
}

export async function upsertSystemSetting(key, value, description) {
  const result = await sql`
    INSERT INTO system_settings (key, value, description)
    VALUES (${key}, ${JSON.stringify(value)}, ${description})
    ON CONFLICT (key) DO UPDATE SET
      value = ${JSON.stringify(value)},
      description = COALESCE(${description}, system_settings.description)
    RETURNING *
  `;
  return result[0];
}

export async function deleteSystemSetting(key) {
  await sql`DELETE FROM system_settings WHERE key = ${key}`;
}

// ============================================
// Utility Functions for Rule Engine
// ============================================

export async function getActiveBlockedKeywords() {
  const results = await sql`
    SELECT value FROM safety_rules
    WHERE rule_type = 'blocked_keyword' AND enabled = true
    ORDER BY priority DESC
  `;
  return results.map(r => r.value);
}

export async function getActiveEscalationKeywords() {
  const results = await sql`
    SELECT category, keywords FROM escalation_settings
    WHERE enabled = true
    ORDER BY priority DESC
  `;
  return results;
}

export async function getActiveRegexPatterns() {
  const results = await sql`
    SELECT value, action, category FROM safety_rules
    WHERE rule_type = 'regex_pattern' AND enabled = true
    ORDER BY priority DESC
  `;
  return results;
}

export async function getActiveModerationThresholds() {
  const results = await sql`
    SELECT category, threshold, action FROM moderation_settings
    WHERE enabled = true
  `;
  return results;
}
