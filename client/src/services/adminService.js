import { api } from './api';

const ADMIN_KEY_STORAGE = 'safechat_admin_key';

// Store admin key in session storage
export function setAdminKey(key) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function getAdminKey() {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

export function clearAdminKey() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

export function isAuthenticated() {
  return !!getAdminKey();
}

// Create axios instance with admin key header
function adminRequest(method, url, data = null) {
  const adminKey = getAdminKey();
  if (!adminKey) {
    return Promise.reject(new Error('Not authenticated'));
  }

  const config = {
    method,
    url,
    headers: {
      'X-Admin-Key': adminKey
    }
  };

  if (data) {
    config.data = data;
  }

  return api(config);
}

// Stats
export async function getStats() {
  const response = await adminRequest('get', '/api/admin/stats');
  return response.data;
}

// Escalations
export async function getEscalations(page = 1, limit = 20) {
  const response = await adminRequest('get', '/api/admin/escalations?page=' + page + '&limit=' + limit);
  return response.data;
}

export async function getEscalation(id) {
  const response = await adminRequest('get', '/api/admin/escalations/' + id);
  return response.data;
}

// Moderation Logs
export async function getModerationLogs(page = 1, limit = 20) {
  const response = await adminRequest('get', '/api/admin/moderation-logs?page=' + page + '&limit=' + limit);
  return response.data;
}

// Knowledge Base
export async function getKnowledgeBase(category = null) {
  const url = category 
    ? '/api/admin/knowledge-base?category=' + encodeURIComponent(category)
    : '/api/admin/knowledge-base';
  const response = await adminRequest('get', url);
  return response.data;
}

export async function getDocument(id) {
  const response = await adminRequest('get', '/api/admin/knowledge-base/' + id);
  return response.data;
}

export async function createDocument(data) {
  const response = await adminRequest('post', '/api/admin/knowledge-base', data);
  return response.data;
}

export async function updateDocument(id, data) {
  const response = await adminRequest('put', '/api/admin/knowledge-base/' + id, data);
  return response.data;
}

export async function deleteDocument(id) {
  const response = await adminRequest('delete', '/api/admin/knowledge-base/' + id);
  return response.data;
}

export async function searchDocuments(query, limit = 5) {
  const response = await adminRequest('post', '/api/admin/knowledge-base/search', { query, limit });
  return response.data;
}

// Verify admin key is valid
export async function verifyAdminKey(key) {
  try {
    const response = await api.get('/api/admin/stats', {
      headers: { 'X-Admin-Key': key }
    });
    return response.data.success;
  } catch (error) {
    return false;
  }
}
