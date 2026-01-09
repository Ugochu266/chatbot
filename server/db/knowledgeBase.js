/**
 * Knowledge Base Database Module
 *
 * This module handles all database operations for the knowledge base in SafeChat.
 * The knowledge base stores documentation and FAQs that provide context for AI
 * responses through RAG (Retrieval-Augmented Generation).
 *
 * How RAG Works:
 * 1. User asks a question
 * 2. searchDocuments() finds relevant knowledge base articles
 * 3. Matching content is included in the AI prompt as context
 * 4. AI generates response using both its training and the retrieved context
 *
 * Table Schema (knowledge_base):
 * - id: Serial primary key
 * - title: Document title (searchable)
 * - category: Classification (e.g., 'returns', 'shipping', 'account')
 * - content: Full document text (searchable)
 * - keywords: Array of keyword tags for improved search
 * - created_at: Timestamp
 *
 * Search Algorithm:
 * - Keyword tokenization from query
 * - Scoring based on:
 *   - Title matches (3x weight - most important)
 *   - Content matches (1x weight)
 *   - Keyword tag matches (2x weight)
 * - Results ordered by relevance score
 *
 * @module db/knowledgeBase
 */

import sql from './index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT SEARCH (RAG)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search the knowledge base for relevant documents.
 *
 * This is the core RAG function - it finds documents relevant to a user's
 * query using keyword matching with weighted scoring. Results are used
 * as context for AI response generation.
 *
 * Scoring System:
 * - Title keyword match: +3 points (most specific indicator)
 * - Content keyword match: +1 point (broad relevance)
 * - Keyword tag match: +2 points (curated relevance)
 *
 * Query Processing:
 * - Converted to lowercase for case-insensitive matching
 * - Punctuation removed
 * - Split into individual words
 * - Words under 3 characters filtered out (stop words)
 *
 * @param {string} query - The user's question or search query
 * @param {number} [limit=3] - Maximum number of documents to return
 * @returns {Promise<Array>} Array of matching documents sorted by relevance
 *
 * @example
 * const docs = await searchDocuments('how to return an item', 3);
 * // Returns top 3 documents about returns policy
 */
export async function searchDocuments(query, limit = 3) {
  // ─────────────────────────────────────────────────────────────────────────────
  // KEYWORD EXTRACTION
  // Convert query to searchable keywords
  // ─────────────────────────────────────────────────────────────────────────────
  const keywords = query
    .toLowerCase()                    // Case-insensitive matching
    .replace(/[^\w\s]/g, '')         // Remove punctuation
    .split(/\s+/)                     // Split on whitespace
    .filter(word => word.length > 2); // Remove short words (stop words)

  // Return empty if no valid keywords
  if (keywords.length === 0) {
    return [];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WEIGHTED SEARCH QUERY
  // Search across title, content, and keyword tags with different weights
  // ─────────────────────────────────────────────────────────────────────────────
  const results = await sql`
    SELECT id, title, category, content,
      (
        -- Score based on keyword matches in title and content
        -- Title matches are worth 3x (most specific)
        (SELECT COUNT(*) FROM unnest(${keywords}::text[]) AS kw
         WHERE LOWER(title) LIKE '%' || kw || '%') * 3 +
        -- Content matches are worth 1x (broad relevance)
        (SELECT COUNT(*) FROM unnest(${keywords}::text[]) AS kw
         WHERE LOWER(content) LIKE '%' || kw || '%') +
        -- Keyword tag matches are worth 2x (curated relevance)
        (SELECT COUNT(*) FROM unnest(keywords) AS doc_kw, unnest(${keywords}::text[]) AS search_kw
         WHERE LOWER(doc_kw) = search_kw) * 2
      ) as relevance_score
    FROM knowledge_base
    WHERE
      -- Match if any keyword appears in title
      (SELECT bool_or(LOWER(title) LIKE '%' || kw || '%') FROM unnest(${keywords}::text[]) AS kw) OR
      -- Match if any keyword appears in content
      (SELECT bool_or(LOWER(content) LIKE '%' || kw || '%') FROM unnest(${keywords}::text[]) AS kw) OR
      -- Match if any keyword matches a tag
      (SELECT bool_or(LOWER(k) = ANY(${keywords}::text[])) FROM unnest(keywords) AS k)
    ORDER BY relevance_score DESC
    LIMIT ${limit}
  `;

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all documents in a specific category.
 *
 * Useful for browsing the knowledge base by topic or for displaying
 * category-specific help sections in the UI.
 *
 * @param {string} category - Category name (e.g., 'returns', 'shipping')
 * @returns {Promise<Array>} Array of documents in the category, sorted by title
 */
export async function getDocumentsByCategory(category) {
  const results = await sql`
    SELECT id, title, category, content, keywords
    FROM knowledge_base
    WHERE category = ${category}
    ORDER BY title
  `;
  return results;
}

/**
 * Get a single document by ID.
 *
 * Retrieves the full document for viewing or editing in admin interface.
 *
 * @param {string} id - Document ID
 * @returns {Promise<Object|null>} The document object or null if not found
 */
export async function getDocument(id) {
  const result = await sql`
    SELECT * FROM knowledge_base WHERE id = ${id}
  `;
  return result[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT MANAGEMENT (ADMIN)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add a new document to the knowledge base.
 *
 * Creates a new knowledge base article. The keywords array should contain
 * relevant terms that users might search for, beyond what's in the content.
 *
 * @param {string} title - Document title (appears in search results)
 * @param {string} category - Category for organization
 * @param {string} content - Full document text
 * @param {string[]} [keywords=[]] - Array of keyword tags for search
 * @returns {Promise<Object>} The created document object
 *
 * @example
 * await addDocument(
 *   'Return Policy',
 *   'returns',
 *   'You can return items within 30 days...',
 *   ['refund', 'exchange', 'return']
 * );
 */
export async function addDocument(title, category, content, keywords = []) {
  const result = await sql`
    INSERT INTO knowledge_base (title, category, content, keywords)
    VALUES (${title}, ${category}, ${content}, ${keywords})
    RETURNING *
  `;
  return result[0];
}

/**
 * Update an existing document.
 *
 * Replaces all fields of an existing document. Useful for keeping
 * knowledge base content up-to-date.
 *
 * @param {string} id - Document ID to update
 * @param {string} title - New title
 * @param {string} category - New category
 * @param {string} content - New content
 * @param {string[]} [keywords=[]] - New keywords array
 * @returns {Promise<Object>} The updated document object
 */
export async function updateDocument(id, title, category, content, keywords = []) {
  const result = await sql`
    UPDATE knowledge_base
    SET title = ${title}, category = ${category}, content = ${content}, keywords = ${keywords}
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0];
}

/**
 * Delete a document from the knowledge base.
 *
 * Permanently removes a document. Consider archiving instead if you
 * might need to restore it later.
 *
 * @param {string} id - Document ID to delete
 */
export async function deleteDocument(id) {
  await sql`DELETE FROM knowledge_base WHERE id = ${id}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all unique categories in the knowledge base.
 *
 * Returns a list of all category names currently in use.
 * Useful for building category filters or dropdown menus.
 *
 * @returns {Promise<string[]>} Array of unique category names, sorted alphabetically
 */
export async function getAllCategories() {
  const result = await sql`
    SELECT DISTINCT category FROM knowledge_base ORDER BY category
  `;
  return result.map(r => r.category);
}
