/**
 * Rules Service Module
 *
 * This module provides API functions for managing SafeChat's configurable
 * safety system. It covers four main areas of configuration:
 *
 * 1. Safety Rules - Dynamic content filtering rules
 *    - Blocked keywords
 *    - Regex patterns
 *    - Custom response rules
 *
 * 2. Moderation Settings - OpenAI moderation API configuration
 *    - Per-category thresholds (0-1 confidence)
 *    - Actions per category (block, escalate, flag)
 *
 * 3. Escalation Settings - Human escalation triggers
 *    - Keywords per category (crisis, legal, etc.)
 *    - Response templates
 *
 * 4. System Settings - General configuration
 *    - Feature flags
 *    - Runtime parameters
 *
 * All settings are database-driven and take effect immediately
 * without requiring server restart.
 *
 * API Endpoints Used:
 * - /api/admin/rules/* - Safety rules CRUD
 * - /api/admin/settings/moderation/* - Moderation config
 * - /api/admin/settings/escalation/* - Escalation config
 * - /api/admin/settings/system/* - System settings
 *
 * @module services/rulesService
 */

import { api } from './api';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Storage key for admin authentication.
 * Matches the key used in adminService for consistency.
 */
const ADMIN_KEY_STORAGE = 'safechat_admin_key';

/**
 * Get admin authentication headers.
 *
 * Retrieves the admin key from session storage and formats it
 * as an HTTP header object for API requests.
 *
 * @returns {Object} Headers object with X-Admin-Key if authenticated
 * @private
 */
function getHeaders() {
  const adminKey = sessionStorage.getItem(ADMIN_KEY_STORAGE);
  return adminKey ? { 'X-Admin-Key': adminKey } : {};
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAFETY RULES API
// Dynamic rules for content filtering
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get safety rules with optional filtering.
 *
 * Retrieves rules from the database, optionally filtered by type,
 * category, or enabled status. Results are sorted by priority.
 *
 * Rule Types:
 * - 'blocked_keyword': Words/phrases that trigger blocking
 * - 'regex_pattern': Regex patterns for complex matching
 * - 'response_template': Canned responses for specific triggers
 *
 * @param {Object} [filters={}] - Optional filters:
 *   - ruleType: Filter by rule type
 *   - category: Filter by category
 *   - enabled: Filter by enabled status (boolean)
 * @returns {Promise<Object>} Object with rules array
 */
export async function getRules(filters = {}) {
  // Build query string from filters
  const params = new URLSearchParams();
  if (filters.ruleType) params.set('ruleType', filters.ruleType);
  if (filters.category) params.set('category', filters.category);
  if (filters.enabled !== undefined) params.set('enabled', filters.enabled);

  const queryString = params.toString();
  const url = queryString ? `/api/admin/rules?${queryString}` : '/api/admin/rules';

  const response = await api.get(url, { headers: getHeaders() });
  return response.data;
}

/**
 * Get a single safety rule by ID.
 *
 * @param {string} id - Rule UUID
 * @returns {Promise<Object>} Rule object
 */
export async function getRule(id) {
  const response = await api.get(`/api/admin/rules/${id}`, { headers: getHeaders() });
  return response.data;
}

/**
 * Create a new safety rule.
 *
 * @param {Object} data - Rule data:
 *   - ruleType: Type of rule (required)
 *   - category: Category for organization (required)
 *   - value: The rule value - keyword, regex, etc. (required)
 *   - action: Action to take - 'block', 'escalate', 'flag' (default: 'block')
 *   - priority: Higher priority rules match first (default: 0)
 *   - enabled: Whether rule is active (default: true)
 *   - description: Human-readable description
 * @returns {Promise<Object>} Created rule object
 */
export async function createRule(data) {
  const response = await api.post('/api/admin/rules', data, { headers: getHeaders() });
  return response.data;
}

/**
 * Update an existing safety rule.
 *
 * @param {string} id - Rule UUID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated rule object
 */
export async function updateRule(id, data) {
  const response = await api.put(`/api/admin/rules/${id}`, data, { headers: getHeaders() });
  return response.data;
}

/**
 * Delete a safety rule.
 *
 * @param {string} id - Rule UUID to delete
 * @returns {Promise<Object>} Deletion confirmation
 */
export async function deleteRule(id) {
  const response = await api.delete(`/api/admin/rules/${id}`, { headers: getHeaders() });
  return response.data;
}

/**
 * Create multiple rules at once.
 *
 * Bulk import for adding many rules efficiently.
 * Useful for importing exported rules or seeding data.
 *
 * @param {Array} rules - Array of rule data objects
 * @returns {Promise<Object>} Object with created rules array
 */
export async function bulkCreateRules(rules) {
  const response = await api.post('/api/admin/rules/bulk', { rules }, { headers: getHeaders() });
  return response.data;
}

/**
 * Export all safety rules.
 *
 * Returns all rules in a format suitable for backup or import.
 *
 * @returns {Promise<Object>} Object with rules array for export
 */
export async function exportRules() {
  const response = await api.get('/api/admin/rules/export/all', { headers: getHeaders() });
  return response.data;
}

/**
 * Test a single rule against sample text.
 *
 * Useful for validating rules before enabling them.
 *
 * @param {string} ruleType - Type of rule ('blocked_keyword', 'regex_pattern')
 * @param {string} value - Rule value to test
 * @param {string} testText - Sample text to test against
 * @returns {Promise<Object>} Test result with match status
 */
export async function testRule(ruleType, value, testText) {
  const response = await api.post('/api/admin/rules/test', { ruleType, value, testText }, { headers: getHeaders() });
  return response.data;
}

/**
 * Test all enabled rules against sample text.
 *
 * Runs text through the entire rule engine to see what would match.
 *
 * @param {string} text - Sample text to test
 * @returns {Promise<Object>} Test results with all matching rules
 */
export async function testAllRules(text) {
  const response = await api.post('/api/admin/rules/test-all', { text }, { headers: getHeaders() });
  return response.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODERATION SETTINGS API
// OpenAI moderation API configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all moderation settings.
 *
 * Returns configuration for each OpenAI moderation category
 * including thresholds and actions.
 *
 * OpenAI Categories:
 * - hate, hate/threatening
 * - harassment, harassment/threatening
 * - self-harm, self-harm/intent, self-harm/instructions
 * - sexual, sexual/minors
 * - violence, violence/graphic
 * - illicit, illicit/violent
 *
 * @returns {Promise<Object>} Object with settings array
 */
export async function getModerationSettings() {
  const response = await api.get('/api/admin/settings/moderation', { headers: getHeaders() });
  return response.data;
}

/**
 * Update moderation setting for a category.
 *
 * @param {string} category - Moderation category name
 * @param {Object} data - Settings to update:
 *   - enabled: Whether to check this category
 *   - threshold: Confidence threshold (0-1)
 *   - action: Action to take when triggered
 * @returns {Promise<Object>} Updated setting object
 */
export async function updateModerationSetting(category, data) {
  const response = await api.put(`/api/admin/settings/moderation/${category}`, data, { headers: getHeaders() });
  return response.data;
}

/**
 * Test moderation on sample text.
 *
 * Sends text through OpenAI's moderation API to see scores
 * for each category. Useful for threshold tuning.
 *
 * @param {string} text - Sample text to moderate
 * @returns {Promise<Object>} Moderation results with category scores
 */
export async function testModeration(text) {
  const response = await api.post('/api/admin/settings/moderation/test', { text }, { headers: getHeaders() });
  return response.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESCALATION SETTINGS API
// Human escalation trigger configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all escalation settings.
 *
 * Returns configuration for each escalation category including
 * trigger keywords and response templates.
 *
 * Default Categories:
 * - crisis: Mental health emergencies
 * - legal: Legal threats, lawyer mentions
 * - complaint: Serious complaints requesting escalation
 * - sentiment: Repeated negative sentiment
 *
 * @returns {Promise<Object>} Object with settings array
 */
export async function getEscalationSettings() {
  const response = await api.get('/api/admin/settings/escalation', { headers: getHeaders() });
  return response.data;
}

/**
 * Update escalation setting for a category.
 *
 * @param {string} category - Escalation category name
 * @param {Object} data - Settings to update:
 *   - enabled: Whether category is active
 *   - keywords: Array of trigger keywords
 *   - responseTemplate: Canned response for this category
 *   - priority: Queue priority (higher = more urgent)
 * @returns {Promise<Object>} Updated setting object
 */
export async function updateEscalationSetting(category, data) {
  const response = await api.put(`/api/admin/settings/escalation/${category}`, data, { headers: getHeaders() });
  return response.data;
}

/**
 * Test escalation detection on sample text.
 *
 * Checks if text would trigger any escalation categories.
 *
 * @param {string} text - Sample text to test
 * @returns {Promise<Object>} Test results with matched categories
 */
export async function testEscalation(text) {
  const response = await api.post('/api/admin/settings/escalation/test', { text }, { headers: getHeaders() });
  return response.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS API
// General configuration and feature flags
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all system settings.
 *
 * Returns key-value pairs for system configuration including
 * rate limits, timeouts, and feature flags.
 *
 * Common Settings:
 * - rate_limit_messages: Max messages per minute
 * - rate_limit_conversations: Max new conversations per minute
 * - openai_timeout: API timeout in milliseconds
 * - escalation_enabled: Master switch for escalation system
 *
 * @returns {Promise<Object>} Object with settings array
 */
export async function getSystemSettings() {
  const response = await api.get('/api/admin/settings/system', { headers: getHeaders() });
  return response.data;
}

/**
 * Update a system setting.
 *
 * @param {string} key - Setting key
 * @param {any} value - New value (will be JSON-serialized)
 * @param {string} [description] - Optional description update
 * @returns {Promise<Object>} Updated setting object
 */
export async function updateSystemSetting(key, value, description) {
  const response = await api.put(`/api/admin/settings/system/${key}`, { value, description }, { headers: getHeaders() });
  return response.data;
}
