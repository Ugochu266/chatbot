/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Safety Rules Database Module
 *
 * This module provides CRUD operations for SafeChat's configurable safety system.
 * It manages four types of safety configuration:
 *
 * 1. Safety Rules - Dynamic rules for content filtering
 *    - Blocked keywords
 *    - Regex patterns
 *    - Custom response rules
 *
 * 2. Moderation Settings - OpenAI moderation API configuration
 *    - Per-category thresholds
 *    - Actions per category (block, escalate, flag, warn)
 *
 * 3. Escalation Settings - Human escalation triggers
 *    - Keywords per category
 *    - Response templates
 *    - Priority levels
 *
 * 4. System Settings - General key-value configuration
 *    - Feature flags
 *    - Runtime parameters
 *
 * Database Tables:
 * - safety_rules: Dynamic safety rules (rule_type, value, action, priority)
 * - moderation_settings: Per-category moderation config (category, threshold, action)
 * - escalation_settings: Escalation triggers (category, keywords, response_template)
 * - system_settings: Key-value store (key, value, description)
 *
 * Design Philosophy:
 * - All safety configuration is database-driven (not hardcoded)
 * - Changes take effect immediately (no restart needed)
 * - Rules are cached at runtime for performance (see ruleEngine.js)
 * - Priority ordering allows fine-grained control
 *
 * @module db/safetyRules
 */

import sql from './index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SAFETY RULES CRUD
// Dynamic rules for content filtering and blocking
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get safety rules with optional filtering.
 *
 * Retrieves rules from the safety_rules table, optionally filtered by
 * rule type, category, or enabled status. Results are sorted by priority
 * (highest first) then by creation date.
 *
 * Rule Types:
 * - 'blocked_keyword': Words/phrases that trigger blocking
 * - 'regex_pattern': Regex patterns for complex matching
 * - 'response_template': Canned responses for specific triggers
 *
 * @param {Object} [filters={}] - Optional filter criteria:
 *   - ruleType {string} - Filter by rule type
 *   - category {string} - Filter by category
 *   - enabled {boolean} - Filter by enabled status
 * @returns {Promise<Array>} Array of matching rules
 */
export async function getSafetyRules(filters = {}) {
  const { ruleType, category, enabled } = filters;

  // Dynamic query construction with optional filters
  // NULL values in SQL allow conditional filtering
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

/**
 * Get a single safety rule by ID.
 *
 * @param {string} id - UUID of the rule
 * @returns {Promise<Object|null>} The rule object or null if not found
 */
export async function getSafetyRuleById(id) {
  const result = await sql`
    SELECT * FROM safety_rules WHERE id = ${id}
  `;
  return result[0] || null;
}

/**
 * Create a new safety rule.
 *
 * @param {Object} data - Rule data:
 *   - ruleType {string} - Type of rule (required)
 *   - category {string} - Category for organization (required)
 *   - value {string} - The rule value (keyword, regex, etc.) (required)
 *   - action {string} - Action to take: 'block'|'escalate'|'flag' (default: 'block')
 *   - priority {number} - Higher priority rules match first (default: 0)
 *   - enabled {boolean} - Whether rule is active (default: true)
 *   - description {string} - Human-readable description
 *   - createdBy {string} - Admin who created the rule
 * @returns {Promise<Object>} The created rule
 */
export async function createSafetyRule(data) {
  const { ruleType, category, value, action, priority, enabled, description, createdBy } = data;

  const result = await sql`
    INSERT INTO safety_rules (rule_type, category, value, action, priority, enabled, description, created_by)
    VALUES (${ruleType}, ${category}, ${value}, ${action || 'block'}, ${priority || 0}, ${enabled !== false}, ${description}, ${createdBy})
    RETURNING *
  `;
  return result[0];
}

/**
 * Update an existing safety rule.
 *
 * Uses COALESCE to only update fields that are provided,
 * keeping existing values for omitted fields.
 *
 * @param {string} id - UUID of the rule to update
 * @param {Object} data - Fields to update (any subset of createSafetyRule fields)
 * @returns {Promise<Object>} The updated rule
 */
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

/**
 * Delete a safety rule permanently.
 *
 * @param {string} id - UUID of the rule to delete
 */
export async function deleteSafetyRule(id) {
  await sql`DELETE FROM safety_rules WHERE id = ${id}`;
}

/**
 * Create multiple safety rules at once.
 *
 * Useful for importing rules from a file or seeding initial data.
 * Rules are created sequentially (not in a transaction).
 *
 * @param {Array<Object>} rules - Array of rule data objects
 * @returns {Promise<Array>} Array of created rules
 */
export async function bulkCreateSafetyRules(rules) {
  const results = [];
  for (const rule of rules) {
    const created = await createSafetyRule(rule);
    results.push(created);
  }
  return results;
}

/**
 * Get all enabled rules of a specific type.
 *
 * Used by the rule engine to load rules for processing.
 * Only returns enabled rules, sorted by priority.
 *
 * @param {string} ruleType - The type of rules to retrieve
 * @returns {Promise<Array>} Array of enabled rules of that type
 */
export async function getRulesByType(ruleType) {
  const results = await sql`
    SELECT * FROM safety_rules
    WHERE rule_type = ${ruleType} AND enabled = true
    ORDER BY priority DESC
  `;
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODERATION SETTINGS CRUD
// Per-category configuration for OpenAI moderation API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all moderation settings.
 *
 * @returns {Promise<Array>} Array of moderation settings for all categories
 */
export async function getModerationSettings() {
  const results = await sql`
    SELECT * FROM moderation_settings
    ORDER BY category
  `;
  return results;
}

/**
 * Get moderation setting for a specific category.
 *
 * @param {string} category - OpenAI moderation category (e.g., 'hate', 'violence')
 * @returns {Promise<Object|null>} The setting or null if not configured
 */
export async function getModerationSettingByCategory(category) {
  const result = await sql`
    SELECT * FROM moderation_settings WHERE category = ${category}
  `;
  return result[0] || null;
}

/**
 * Create or update a moderation setting.
 *
 * Uses INSERT ... ON CONFLICT for upsert semantics.
 *
 * @param {Object} data - Setting data:
 *   - category {string} - OpenAI moderation category
 *   - enabled {boolean} - Whether to check this category
 *   - threshold {number} - Confidence threshold (0-1)
 *   - action {string} - Action to take when triggered
 * @returns {Promise<Object>} The created/updated setting
 */
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

/**
 * Update a moderation setting (partial update).
 *
 * @param {string} category - Category to update
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} The updated setting
 */
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

// ═══════════════════════════════════════════════════════════════════════════════
// ESCALATION SETTINGS CRUD
// Configuration for human escalation triggers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all escalation settings.
 *
 * @returns {Promise<Array>} Array of escalation settings, sorted by priority
 */
export async function getEscalationSettings() {
  const results = await sql`
    SELECT * FROM escalation_settings
    ORDER BY priority DESC, category
  `;
  return results;
}

/**
 * Get escalation setting for a specific category.
 *
 * @param {string} category - Escalation category (e.g., 'crisis', 'legal')
 * @returns {Promise<Object|null>} The setting or null if not configured
 */
export async function getEscalationSettingByCategory(category) {
  const result = await sql`
    SELECT * FROM escalation_settings WHERE category = ${category}
  `;
  return result[0] || null;
}

/**
 * Create or update an escalation setting.
 *
 * @param {Object} data - Setting data:
 *   - category {string} - Escalation category name
 *   - enabled {boolean} - Whether category is active
 *   - keywords {string[]} - Trigger keywords
 *   - responseTemplate {string} - Canned response for this category
 *   - priority {number} - Queue priority (higher = more urgent)
 * @returns {Promise<Object>} The created/updated setting
 */
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

/**
 * Update an escalation setting (partial update).
 *
 * @param {string} category - Category to update
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} The updated setting
 */
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

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS CRUD
// General key-value configuration store
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all system settings.
 *
 * @returns {Promise<Array>} Array of all system settings
 */
export async function getSystemSettings() {
  const results = await sql`
    SELECT * FROM system_settings
    ORDER BY key
  `;
  return results;
}

/**
 * Get a system setting by key.
 *
 * @param {string} key - Setting key
 * @returns {Promise<Object|null>} The setting or null if not found
 */
export async function getSystemSetting(key) {
  const result = await sql`
    SELECT * FROM system_settings WHERE key = ${key}
  `;
  return result[0] || null;
}

/**
 * Create or update a system setting.
 *
 * @param {string} key - Setting key
 * @param {any} value - Setting value (will be JSON-stringified)
 * @param {string} [description] - Human-readable description
 * @returns {Promise<Object>} The created/updated setting
 */
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

/**
 * Delete a system setting.
 *
 * @param {string} key - Setting key to delete
 */
export async function deleteSystemSetting(key) {
  await sql`DELETE FROM system_settings WHERE key = ${key}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS FOR RULE ENGINE
// Optimized queries for runtime rule loading
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all active blocked keywords.
 *
 * Returns just the values of enabled blocked_keyword rules.
 * Used by the rule engine for keyword matching.
 *
 * @returns {Promise<string[]>} Array of blocked keyword strings
 */
export async function getActiveBlockedKeywords() {
  const results = await sql`
    SELECT value FROM safety_rules
    WHERE rule_type = 'blocked_keyword' AND enabled = true
    ORDER BY priority DESC
  `;
  return results.map(r => r.value);
}

/**
 * Get all active escalation keywords grouped by category.
 *
 * Returns categories with their associated keywords for
 * escalation detection processing.
 *
 * @returns {Promise<Array>} Array of { category, keywords } objects
 */
export async function getActiveEscalationKeywords() {
  const results = await sql`
    SELECT category, keywords FROM escalation_settings
    WHERE enabled = true
    ORDER BY priority DESC
  `;
  return results;
}

/**
 * Get all active regex patterns.
 *
 * Returns regex patterns with their associated actions for
 * pattern-based content filtering.
 *
 * @returns {Promise<Array>} Array of { value, action, category } objects
 */
export async function getActiveRegexPatterns() {
  const results = await sql`
    SELECT value, action, category FROM safety_rules
    WHERE rule_type = 'regex_pattern' AND enabled = true
    ORDER BY priority DESC
  `;
  return results;
}

/**
 * Get all active moderation thresholds.
 *
 * Returns threshold configuration for each enabled moderation category.
 * Used to determine whether moderation scores trigger actions.
 *
 * @returns {Promise<Array>} Array of { category, threshold, action } objects
 */
export async function getActiveModerationThresholds() {
  const results = await sql`
    SELECT category, threshold, action FROM moderation_settings
    WHERE enabled = true
  `;
  return results;
}
