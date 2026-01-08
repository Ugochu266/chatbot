import { api } from './api';

const ADMIN_KEY_STORAGE = 'safechat_admin_key';

function getHeaders() {
  const adminKey = sessionStorage.getItem(ADMIN_KEY_STORAGE);
  return adminKey ? { 'X-Admin-Key': adminKey } : {};
}

// ============================================
// Safety Rules API
// ============================================

export async function getRules(filters = {}) {
  const params = new URLSearchParams();
  if (filters.ruleType) params.set('ruleType', filters.ruleType);
  if (filters.category) params.set('category', filters.category);
  if (filters.enabled !== undefined) params.set('enabled', filters.enabled);

  const queryString = params.toString();
  const url = queryString ? `/api/admin/rules?${queryString}` : '/api/admin/rules';

  const response = await api.get(url, { headers: getHeaders() });
  return response.data;
}

export async function getRule(id) {
  const response = await api.get(`/api/admin/rules/${id}`, { headers: getHeaders() });
  return response.data;
}

export async function createRule(data) {
  const response = await api.post('/api/admin/rules', data, { headers: getHeaders() });
  return response.data;
}

export async function updateRule(id, data) {
  const response = await api.put(`/api/admin/rules/${id}`, data, { headers: getHeaders() });
  return response.data;
}

export async function deleteRule(id) {
  const response = await api.delete(`/api/admin/rules/${id}`, { headers: getHeaders() });
  return response.data;
}

export async function bulkCreateRules(rules) {
  const response = await api.post('/api/admin/rules/bulk', { rules }, { headers: getHeaders() });
  return response.data;
}

export async function exportRules() {
  const response = await api.get('/api/admin/rules/export/all', { headers: getHeaders() });
  return response.data;
}

export async function testRule(ruleType, value, testText) {
  const response = await api.post('/api/admin/rules/test', { ruleType, value, testText }, { headers: getHeaders() });
  return response.data;
}

export async function testAllRules(text) {
  const response = await api.post('/api/admin/rules/test-all', { text }, { headers: getHeaders() });
  return response.data;
}

// ============================================
// Moderation Settings API
// ============================================

export async function getModerationSettings() {
  const response = await api.get('/api/admin/settings/moderation', { headers: getHeaders() });
  return response.data;
}

export async function updateModerationSetting(category, data) {
  const response = await api.put(`/api/admin/settings/moderation/${category}`, data, { headers: getHeaders() });
  return response.data;
}

export async function testModeration(text) {
  const response = await api.post('/api/admin/settings/moderation/test', { text }, { headers: getHeaders() });
  return response.data;
}

// ============================================
// Escalation Settings API
// ============================================

export async function getEscalationSettings() {
  const response = await api.get('/api/admin/settings/escalation', { headers: getHeaders() });
  return response.data;
}

export async function updateEscalationSetting(category, data) {
  const response = await api.put(`/api/admin/settings/escalation/${category}`, data, { headers: getHeaders() });
  return response.data;
}

export async function testEscalation(text) {
  const response = await api.post('/api/admin/settings/escalation/test', { text }, { headers: getHeaders() });
  return response.data;
}

// ============================================
// System Settings API
// ============================================

export async function getSystemSettings() {
  const response = await api.get('/api/admin/settings/system', { headers: getHeaders() });
  return response.data;
}

export async function updateSystemSetting(key, value, description) {
  const response = await api.put(`/api/admin/settings/system/${key}`, { value, description }, { headers: getHeaders() });
  return response.data;
}
