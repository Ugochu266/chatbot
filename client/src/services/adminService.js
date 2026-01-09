/**
 * Admin Service Module
 *
 * This module provides API functions for the SafeChat admin dashboard.
 * It handles authentication, statistics, escalation management, moderation
 * logs, and knowledge base operations.
 *
 * Authentication Model:
 * - Uses a simple API key stored in sessionStorage
 * - All admin requests include X-Admin-Key header
 * - Session storage chosen over local storage for security
 *   (clears on browser close)
 *
 * Admin Dashboard Features:
 * - Real-time statistics (conversations, messages, escalations)
 * - Escalated conversation review and management
 * - Moderation log viewing (flagged content)
 * - Knowledge base CRUD operations
 *
 * API Endpoints Used:
 * - GET /api/admin/stats - Dashboard statistics
 * - GET /api/admin/escalations - List escalated conversations
 * - GET /api/admin/moderation-logs - Flagged content logs
 * - CRUD /api/admin/knowledge-base - Knowledge base management
 *
 * @module services/adminService
 */

import { api } from './api';

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Storage key for admin API key.
 * Using sessionStorage for security - clears when browser tab closes.
 */
const ADMIN_KEY_STORAGE = 'safechat_admin_key';

/**
 * Store admin key in session storage.
 *
 * Called after successful admin login. The key is then automatically
 * included in all subsequent admin API requests.
 *
 * @param {string} key - The admin API key
 */
export function setAdminKey(key) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

/**
 * Retrieve the stored admin key.
 *
 * @returns {string|null} The admin key or null if not logged in
 */
export function getAdminKey() {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

/**
 * Clear the admin key (logout).
 *
 * Removes the admin key from session storage, effectively logging out
 * the admin user. They'll need to re-enter the key to access admin features.
 */
export function clearAdminKey() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

/**
 * Check if an admin is currently authenticated.
 *
 * Note: This only checks for key presence, not validity.
 * The key could be invalid/expired - server validates on each request.
 *
 * @returns {boolean} True if admin key is present
 */
export function isAuthenticated() {
  return !!getAdminKey();
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED REQUEST HELPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Make an authenticated admin API request.
 *
 * Internal helper that adds the X-Admin-Key header to requests.
 * Rejects immediately if no admin key is stored.
 *
 * @param {string} method - HTTP method (get, post, put, delete)
 * @param {string} url - API endpoint URL
 * @param {Object} [data=null] - Request body data (for POST/PUT)
 * @returns {Promise} Axios response promise
 * @private
 */
function adminRequest(method, url, data = null) {
  const adminKey = getAdminKey();

  // Fail fast if not authenticated
  if (!adminKey) {
    return Promise.reject(new Error('Not authenticated'));
  }

  // Build request configuration
  const config = {
    method,
    url,
    headers: {
      'X-Admin-Key': adminKey
    }
  };

  // Add data for POST/PUT requests
  if (data) {
    config.data = data;
  }

  return api(config);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get dashboard statistics.
 *
 * Returns aggregate statistics for the admin dashboard including
 * total conversations, messages, escalation counts, etc.
 *
 * @returns {Promise<Object>} Statistics object with counts and metrics
 */
export async function getStats() {
  const response = await adminRequest('get', '/api/admin/stats');
  return response.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESCALATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get list of escalated conversations.
 *
 * Returns conversations that have been flagged for human review.
 * These are typically conversations containing crisis language,
 * legal threats, or other sensitive content.
 *
 * @param {number} [page=1] - Page number (1-indexed)
 * @param {number} [limit=20] - Items per page
 * @returns {Promise<Object>} Object with escalations array and pagination
 */
export async function getEscalations(page = 1, limit = 20) {
  const response = await adminRequest('get', '/api/admin/escalations?page=' + page + '&limit=' + limit);
  return response.data;
}

/**
 * Get a single escalated conversation with full details.
 *
 * Retrieves complete conversation history for review, including
 * all messages and escalation metadata.
 *
 * @param {string} id - Conversation UUID
 * @returns {Promise<Object>} Escalation details with messages
 */
export async function getEscalation(id) {
  const response = await adminRequest('get', '/api/admin/escalations/' + id);
  return response.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODERATION LOGS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get moderation log entries.
 *
 * Returns messages that were flagged by the OpenAI moderation API.
 * Useful for reviewing flagged content and tuning thresholds.
 *
 * @param {number} [page=1] - Page number (1-indexed)
 * @param {number} [limit=20] - Items per page
 * @returns {Promise<Object>} Object with logs array and pagination
 */
export async function getModerationLogs(page = 1, limit = 20) {
  const response = await adminRequest('get', '/api/admin/moderation-logs?page=' + page + '&limit=' + limit);
  return response.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get knowledge base documents.
 *
 * Returns documents from the knowledge base, optionally filtered by category.
 * The knowledge base provides context for AI responses via RAG.
 *
 * @param {string} [category=null] - Optional category filter
 * @returns {Promise<Object>} Object with documents array
 */
export async function getKnowledgeBase(category = null) {
  const url = category
    ? '/api/admin/knowledge-base?category=' + encodeURIComponent(category)
    : '/api/admin/knowledge-base';
  const response = await adminRequest('get', url);
  return response.data;
}

/**
 * Get a single knowledge base document.
 *
 * @param {string} id - Document ID
 * @returns {Promise<Object>} Document object with content
 */
export async function getDocument(id) {
  const response = await adminRequest('get', '/api/admin/knowledge-base/' + id);
  return response.data;
}

/**
 * Create a new knowledge base document.
 *
 * Adds a new document to the knowledge base. Documents should include
 * relevant keywords for search matching.
 *
 * @param {Object} data - Document data:
 *   - title: Document title
 *   - category: Category for organization
 *   - content: Full document text
 *   - keywords: Array of search keywords
 * @returns {Promise<Object>} Created document object
 */
export async function createDocument(data) {
  const response = await adminRequest('post', '/api/admin/knowledge-base', data);
  return response.data;
}

/**
 * Update an existing knowledge base document.
 *
 * @param {string} id - Document ID
 * @param {Object} data - Updated document fields
 * @returns {Promise<Object>} Updated document object
 */
export async function updateDocument(id, data) {
  const response = await adminRequest('put', '/api/admin/knowledge-base/' + id, data);
  return response.data;
}

/**
 * Delete a knowledge base document.
 *
 * Permanently removes a document from the knowledge base.
 *
 * @param {string} id - Document ID to delete
 * @returns {Promise<Object>} Deletion confirmation
 */
export async function deleteDocument(id) {
  const response = await adminRequest('delete', '/api/admin/knowledge-base/' + id);
  return response.data;
}

/**
 * Search knowledge base documents.
 *
 * Performs a relevance-weighted search across documents.
 * Useful for testing RAG functionality.
 *
 * @param {string} query - Search query text
 * @param {number} [limit=5] - Maximum results to return
 * @returns {Promise<Object>} Object with matching documents
 */
export async function searchDocuments(query, limit = 5) {
  const response = await adminRequest('post', '/api/admin/knowledge-base/search', { query, limit });
  return response.data;
}

/**
 * Bulk import multiple documents at once.
 *
 * Accepts an array of document objects, typically parsed from JSON or CSV files.
 * Useful for importing product catalogs, spare parts data, FAQ lists, etc.
 *
 * Expected document format:
 * - title: Document title (required)
 * - category: Document category (required)
 * - content: Full document text (required)
 * - keywords: Array or comma-separated string of keywords (optional)
 *
 * @param {Array} documents - Array of document objects to import
 * @returns {Promise<Object>} Import result with counts:
 *   - imported: Number successfully imported
 *   - failed: Number that failed
 *   - errors: Array of error details
 */
export async function bulkImportDocuments(documents) {
  const response = await adminRequest('post', '/api/admin/knowledge-base/bulk-import', { documents });
  return response.data;
}

/**
 * Bulk delete multiple documents at once.
 *
 * Permanently removes multiple documents from the knowledge base.
 *
 * @param {Array<string>} ids - Array of document IDs to delete
 * @returns {Promise<Object>} Delete result with counts:
 *   - deleted: Number successfully deleted
 *   - failed: Number that failed to delete
 */
export async function bulkDeleteDocuments(ids) {
  const response = await adminRequest('post', '/api/admin/knowledge-base/bulk-delete', { ids });
  return response.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPARE PARTS CATALOG MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all spare parts with optional filtering.
 *
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.category] - Filter by part category
 * @param {string} [filters.make] - Filter by vehicle make
 * @param {string} [filters.stockStatus] - Filter by stock status
 * @returns {Promise<Object>} Object with parts array, categories, and makes
 */
export async function getSpareParts(filters = {}) {
  const params = new URLSearchParams();
  if (filters.category) params.append('category', filters.category);
  if (filters.make) params.append('make', filters.make);
  if (filters.stockStatus) params.append('stockStatus', filters.stockStatus);

  const queryString = params.toString();
  const url = queryString ? `/api/admin/spare-parts?${queryString}` : '/api/admin/spare-parts';
  const response = await adminRequest('get', url);
  return response.data;
}

/**
 * Get a single spare part by ID.
 *
 * @param {number} id - Spare part ID
 * @returns {Promise<Object>} Spare part object
 */
export async function getSparePart(id) {
  const response = await adminRequest('get', `/api/admin/spare-parts/${id}`);
  return response.data;
}

/**
 * Get all models for a specific vehicle make.
 *
 * @param {string} make - Vehicle manufacturer
 * @returns {Promise<Object>} Object with models array
 */
export async function getModelsByMake(make) {
  const response = await adminRequest('get', `/api/admin/spare-parts/models/${encodeURIComponent(make)}`);
  return response.data;
}

/**
 * Create a new spare part.
 *
 * @param {Object} data - Spare part data with exact CSV column names:
 *   - vehicle_make, vehicle_model, year_from, year_to
 *   - part_number, part_category, part_description
 *   - price_gbp, price_usd, stock_status, compatibility_notes
 * @returns {Promise<Object>} Created spare part
 */
export async function createSparePart(data) {
  const response = await adminRequest('post', '/api/admin/spare-parts', data);
  return response.data;
}

/**
 * Update an existing spare part.
 *
 * @param {number} id - Spare part ID
 * @param {Object} data - Updated spare part data
 * @returns {Promise<Object>} Updated spare part
 */
export async function updateSparePart(id, data) {
  const response = await adminRequest('put', `/api/admin/spare-parts/${id}`, data);
  return response.data;
}

/**
 * Delete a spare part.
 *
 * @param {number} id - Spare part ID
 * @returns {Promise<Object>} Deletion confirmation
 */
export async function deleteSparePart(id) {
  const response = await adminRequest('delete', `/api/admin/spare-parts/${id}`);
  return response.data;
}

/**
 * Search spare parts using RAG algorithm.
 *
 * @param {string} query - Search query text
 * @param {number} [limit=5] - Maximum results
 * @returns {Promise<Object>} Object with matching parts
 */
export async function searchSpareParts(query, limit = 5) {
  const response = await adminRequest('post', '/api/admin/spare-parts/search', { query, limit });
  return response.data;
}

/**
 * Bulk import spare parts from CSV data.
 *
 * Accepts an array of objects matching exact CSV column format.
 * Updates existing parts if part_number already exists.
 *
 * Expected format (exact CSV columns):
 * - vehicle_make: Vehicle manufacturer
 * - vehicle_model: Vehicle model
 * - year_from: Start year of compatibility
 * - year_to: End year of compatibility
 * - part_number: Unique part identifier
 * - part_category: Part category (Brakes, Filters, etc.)
 * - part_description: Human-readable description
 * - price_gbp: Price in British Pounds
 * - price_usd: Price in US Dollars
 * - stock_status: Availability (In Stock, Out of Stock)
 * - compatibility_notes: Additional notes
 *
 * @param {Array} parts - Array of spare part objects
 * @returns {Promise<Object>} Import result with counts:
 *   - imported: Number of new parts imported
 *   - updated: Number of existing parts updated
 *   - failed: Number that failed
 *   - errors: Array of error details
 */
export async function bulkImportSpareParts(parts) {
  const response = await adminRequest('post', '/api/admin/spare-parts/bulk-import', { parts });
  return response.data;
}

/**
 * Bulk delete multiple spare parts at once.
 *
 * Permanently removes multiple spare parts from the catalog.
 *
 * @param {Array<number>} ids - Array of spare part IDs to delete
 * @returns {Promise<Object>} Delete result with counts:
 *   - deleted: Number successfully deleted
 *   - failed: Number that failed to delete
 */
export async function bulkDeleteSpareParts(ids) {
  const response = await adminRequest('post', '/api/admin/spare-parts/bulk-delete', { ids });
  return response.data;
}

/**
 * Bulk update stock status for multiple spare parts.
 *
 * Updates the stock status for multiple parts at once.
 *
 * @param {Array<number>} ids - Array of spare part IDs to update
 * @param {string} stockStatus - New status ('In Stock', 'Low Stock', 'Out of Stock')
 * @returns {Promise<Object>} Update result with counts:
 *   - updated: Number successfully updated
 *   - failed: Number that failed to update
 */
export async function bulkUpdateSparePartsStatus(ids, stockStatus) {
  const response = await adminRequest('put', '/api/admin/spare-parts/bulk-status', { ids, stockStatus });
  return response.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify an admin key is valid.
 *
 * Tests if a given admin key is accepted by the server by making
 * a stats request. Used during login to validate the key before storing.
 *
 * @param {string} key - Admin key to verify
 * @returns {Promise<boolean>} True if key is valid
 */
export async function verifyAdminKey(key) {
  try {
    const response = await api.get('/api/admin/stats', {
      headers: { 'X-Admin-Key': key }
    });
    return response.data.success;
  } catch (error) {
    // Invalid key returns 403, treat as invalid
    return false;
  }
}
