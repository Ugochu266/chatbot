/**
 * Admin Routes Module
 *
 * This module provides REST API endpoints for administrative functions in SafeChat.
 * These endpoints are protected by admin authentication and provide access to:
 *
 * - Escalated Conversations: View and manage conversations flagged for human review
 * - Moderation Logs: Access logs of content flagged by the moderation system
 * - Statistics Dashboard: Aggregate metrics on system usage and performance
 * - Knowledge Base Management: CRUD operations for RAG documentation
 *
 * Security:
 * - All routes require admin authentication via x-admin-key header
 * - In production, replace the simple key check with proper authentication
 *
 * Base Path: /api/admin
 *
 * @module routes/admin
 */

import { Router } from 'express';
import { getEscalatedConversations, getConversationWithMessages } from '../db/conversations.js';
import { getFlaggedLogs } from '../db/moderationLogs.js';
import {
  searchDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  getAllCategories,
  getDocumentsByCategory
} from '../db/knowledgeBase.js';
import {
  initSparePartsTable,
  searchSpareParts,
  searchByVehicle,
  getAllSpareParts,
  getSparePartById,
  getSparePartByNumber,
  addSparePart,
  updateSparePart,
  deleteSparePart,
  bulkImportSpareParts,
  getAllCategories as getPartCategories,
  getAllMakes,
  getModelsByMake,
  getSparePartsCount
} from '../db/spareParts.js';
import { validatePagination, validateConversationId } from '../middleware/validator.js';
import { AppError } from '../middleware/errorHandler.js';
import sql from '../db/index.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple admin authentication middleware.
 *
 * IMPORTANT: This is a simplified implementation for demonstration purposes.
 * In a production environment, you should:
 * - Use proper authentication (JWT, OAuth, etc.)
 * - Store keys securely (environment variables, secrets manager)
 * - Implement rate limiting on admin endpoints
 * - Add audit logging for admin actions
 *
 * Current behavior:
 * - Requires 'x-admin-key' header to be present
 * - Key must be at least 8 characters long
 * - Does not validate against a specific stored key
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @throws {AppError} 401 if admin key is missing or too short
 */
function adminCheck(req, res, next) {
  const adminKey = req.headers['x-admin-key'];

  // Basic validation: key must exist and be reasonably long
  // TODO: In production, validate against actual stored admin key
  if (!adminKey || adminKey.length < 8) {
    throw new AppError('Admin access required', 401, 'UNAUTHORIZED');
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESCALATION MANAGEMENT ROUTES
// These endpoints allow admins to review conversations flagged for human attention
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/escalations
 *
 * List all escalated conversations with pagination.
 * Escalated conversations are those flagged by the safety pipeline for human review,
 * typically due to crisis detection, legal concerns, or complaint requests.
 *
 * Query Parameters:
 * - page {number} - Page number (default: 1)
 * - limit {number} - Items per page (default: 20, max: 100)
 *
 * Response:
 * - escalations: Array of escalated conversation summaries
 * - pagination: Pagination metadata
 */
router.get('/escalations', adminCheck, validatePagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await getEscalatedConversations(page, limit);

    // Transform database records to API response format
    // Uses camelCase for JSON response (JavaScript convention)
    res.json({
      success: true,
      escalations: result.conversations.map(c => ({
        id: c.id,
        sessionId: c.session_id,           // User's session identifier
        escalationReason: c.escalation_reason, // Why it was escalated (CRISIS_DETECTED, etc.)
        lastMessage: c.last_message,        // Preview of the last message
        createdAt: c.created_at,
        updatedAt: c.updated_at
      })),
      pagination: {
        page,
        limit,
        total: result.total
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/escalations/:id
 *
 * Get full details of a specific escalated conversation including all messages.
 * Used by admins to review the complete context of an escalated conversation.
 *
 * Path Parameters:
 * - id {uuid} - Conversation ID
 *
 * Response:
 * - conversation: Full conversation object with all messages
 *
 * Errors:
 * - 404: Conversation not found
 * - 400: Conversation exists but is not escalated
 */
router.get('/escalations/:id', adminCheck, validateConversationId, async (req, res, next) => {
  try {
    const conversation = await getConversationWithMessages(req.params.id);

    // Verify conversation exists
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'NOT_FOUND');
    }

    // Verify this is actually an escalated conversation
    // This endpoint should only be used for escalated conversations
    if (!conversation.escalated) {
      throw new AppError('Conversation is not escalated', 400, 'BAD_REQUEST');
    }

    res.json({
      success: true,
      conversation: {
        id: conversation.id,
        sessionId: conversation.session_id,
        escalated: conversation.escalated,
        escalationReason: conversation.escalation_reason,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        // Include full message history for admin review
        messages: conversation.messages.map(m => ({
          id: m.id,
          role: m.role,                    // 'user' or 'assistant'
          content: m.content,
          createdAt: m.created_at,
          flagged: m.moderation_flagged    // Was this message flagged by moderation?
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODERATION LOGS ROUTES
// View logs of content flagged by the OpenAI moderation API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/moderation-logs
 *
 * Get logs of messages flagged by the content moderation system.
 * Useful for auditing moderation decisions and tuning thresholds.
 *
 * Query Parameters:
 * - page {number} - Page number (default: 1)
 * - limit {number} - Items per page (default: 20)
 *
 * Response:
 * - logs: Array of moderation log entries with message content and scores
 */
router.get('/moderation-logs', adminCheck, validatePagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const logs = await getFlaggedLogs(page, limit);

    res.json({
      success: true,
      logs: logs.map(log => ({
        id: log.id,
        messageId: log.message_id,
        messageContent: log.content,      // The actual message that was flagged
        messageRole: log.role,            // Who sent it (user/assistant)
        flagged: log.flagged,             // Whether it was flagged
        categories: log.categories,       // Which moderation categories triggered
        scores: log.scores,               // Raw scores from OpenAI moderation API
        createdAt: log.created_at
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICS DASHBOARD
// Aggregate metrics for monitoring system health and usage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/stats
 *
 * Get comprehensive statistics about the SafeChat system.
 * Provides metrics for monitoring system health, usage patterns, and safety events.
 *
 * Statistics Returned:
 * - conversations: Total, escalated, and recent counts
 * - messages: Total, by role, flagged count, avg response time/tokens
 * - moderation: Total events and flagged events
 * - knowledgeBase: Document and category counts
 * - dailyActivity: Message counts per day for the last 7 days
 *
 * Response is optimized for dashboard display.
 */
router.get('/stats', adminCheck, async (req, res, next) => {
  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // CONVERSATION STATISTICS
    // Counts of total, escalated, and recent conversations
    // ─────────────────────────────────────────────────────────────────────────────
    const conversationStats = await sql`
      SELECT
        COUNT(*) as total_conversations,
        COUNT(*) FILTER (WHERE escalated = true) as escalated_conversations,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as conversations_last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as conversations_last_7d
      FROM conversations
    `;

    // ─────────────────────────────────────────────────────────────────────────────
    // MESSAGE STATISTICS
    // Message counts, flagged messages, and performance metrics
    // ─────────────────────────────────────────────────────────────────────────────
    const messageStats = await sql`
      SELECT
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE role = 'user') as user_messages,
        COUNT(*) FILTER (WHERE role = 'assistant') as assistant_messages,
        COUNT(*) FILTER (WHERE moderation_flagged = true) as flagged_messages,
        AVG(response_time_ms) FILTER (WHERE role = 'assistant') as avg_response_time_ms,
        AVG(tokens_used) FILTER (WHERE role = 'assistant') as avg_tokens_used
      FROM messages
    `;

    // ─────────────────────────────────────────────────────────────────────────────
    // MODERATION STATISTICS
    // Total moderation events and how many were flagged
    // ─────────────────────────────────────────────────────────────────────────────
    const moderationStats = await sql`
      SELECT
        COUNT(*) as total_moderation_events,
        COUNT(*) FILTER (WHERE flagged = true) as flagged_events
      FROM moderation_logs
    `;

    // ─────────────────────────────────────────────────────────────────────────────
    // KNOWLEDGE BASE STATISTICS
    // Document counts for RAG system
    // ─────────────────────────────────────────────────────────────────────────────
    const knowledgeStats = await sql`
      SELECT
        COUNT(*) as total_documents,
        COUNT(DISTINCT category) as total_categories
      FROM knowledge_base
    `;

    // ─────────────────────────────────────────────────────────────────────────────
    // DAILY ACTIVITY BREAKDOWN
    // Message and flagged counts per day for the last 7 days
    // Useful for trend analysis and identifying spikes
    // ─────────────────────────────────────────────────────────────────────────────
    const dailyActivity = await sql`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as messages,
        COUNT(*) FILTER (WHERE moderation_flagged = true) as flagged
      FROM messages
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    // ─────────────────────────────────────────────────────────────────────────────
    // FORMAT AND RETURN RESPONSE
    // Parse all values to appropriate types (PostgreSQL returns strings for counts)
    // ─────────────────────────────────────────────────────────────────────────────
    res.json({
      success: true,
      stats: {
        conversations: {
          total: parseInt(conversationStats[0].total_conversations) || 0,
          escalated: parseInt(conversationStats[0].escalated_conversations) || 0,
          last24h: parseInt(conversationStats[0].conversations_last_24h) || 0,
          last7d: parseInt(conversationStats[0].conversations_last_7d) || 0
        },
        messages: {
          total: parseInt(messageStats[0].total_messages) || 0,
          user: parseInt(messageStats[0].user_messages) || 0,
          assistant: parseInt(messageStats[0].assistant_messages) || 0,
          flagged: parseInt(messageStats[0].flagged_messages) || 0,
          avgResponseTimeMs: Math.round(parseFloat(messageStats[0].avg_response_time_ms) || 0),
          avgTokensUsed: Math.round(parseFloat(messageStats[0].avg_tokens_used) || 0)
        },
        moderation: {
          totalEvents: parseInt(moderationStats[0].total_moderation_events) || 0,
          flaggedEvents: parseInt(moderationStats[0].flagged_events) || 0
        },
        knowledgeBase: {
          totalDocuments: parseInt(knowledgeStats[0].total_documents) || 0,
          totalCategories: parseInt(knowledgeStats[0].total_categories) || 0
        },
        dailyActivity: dailyActivity.map(d => ({
          date: d.date,
          messages: parseInt(d.messages),
          flagged: parseInt(d.flagged)
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE MANAGEMENT ROUTES
// CRUD operations for RAG documentation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/knowledge-base
 *
 * List all documents in the knowledge base.
 * Optionally filter by category.
 *
 * Query Parameters:
 * - category {string} - Filter by document category (optional)
 *
 * Response:
 * - documents: Array of document objects
 * - categories: List of all available categories
 */
router.get('/knowledge-base', adminCheck, async (req, res, next) => {
  try {
    const { category } = req.query;

    // Fetch documents - either filtered by category or all
    let documents;
    if (category) {
      documents = await getDocumentsByCategory(category);
    } else {
      // Get all documents ordered by category and title
      documents = await sql`
        SELECT id, title, category, content, keywords, updated_at
        FROM knowledge_base
        ORDER BY category, title
      `;
    }

    // Also fetch all categories for the filter dropdown
    const categories = await getAllCategories();

    res.json({
      success: true,
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        keywords: doc.keywords || [],  // Keywords used for search enhancement
        updatedAt: doc.updated_at
      })),
      categories  // Available categories for filtering
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/knowledge-base/:id
 *
 * Get a single document by ID.
 *
 * Path Parameters:
 * - id {uuid} - Document ID
 *
 * Response:
 * - document: Full document object with all fields
 *
 * Errors:
 * - 404: Document not found
 */
router.get('/knowledge-base/:id', adminCheck, async (req, res, next) => {
  try {
    const document = await getDocument(req.params.id);

    if (!document) {
      throw new AppError('Document not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        category: document.category,
        content: document.content,
        keywords: document.keywords || [],
        createdAt: document.created_at,
        updatedAt: document.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/knowledge-base
 *
 * Create a new document in the knowledge base.
 * This document will be available for RAG retrieval.
 *
 * Request Body:
 * - title {string} - Document title (required)
 * - category {string} - Document category (required)
 * - content {string} - Document content (required)
 * - keywords {string[]} - Search keywords (optional)
 *
 * Response:
 * - document: The created document with ID and timestamps
 *
 * Errors:
 * - 400: Missing required fields
 */
router.post('/knowledge-base', adminCheck, async (req, res, next) => {
  try {
    const { title, category, content, keywords = [] } = req.body;

    // Validate required fields
    if (!title || !category || !content) {
      throw new AppError('Title, category, and content are required', 400, 'VALIDATION_ERROR');
    }

    const document = await addDocument(title, category, content, keywords);

    res.status(201).json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        category: document.category,
        content: document.content,
        keywords: document.keywords || [],
        createdAt: document.created_at,
        updatedAt: document.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/knowledge-base/search
 *
 * Search documents using the same algorithm as RAG retrieval.
 * Useful for testing how documents will be found during conversations.
 *
 * Request Body:
 * - query {string} - Search query (required)
 * - limit {number} - Max results to return (default: 5)
 *
 * Response:
 * - documents: Array of matching documents with relevance scores
 *
 * Errors:
 * - 400: Missing search query
 */
router.post('/knowledge-base/search', adminCheck, async (req, res, next) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query) {
      throw new AppError('Search query is required', 400, 'VALIDATION_ERROR');
    }

    const documents = await searchDocuments(query, limit);

    res.json({
      success: true,
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        relevanceScore: doc.relevance_score
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/knowledge-base/bulk-delete
 *
 * Bulk delete multiple documents at once.
 * Permanently removes documents from the knowledge base.
 *
 * Request Body:
 * - ids {Array<string>} - Array of document IDs to delete
 *
 * Response:
 * - deleted: Number of successfully deleted documents
 * - failed: Number of documents that failed to delete
 *
 * Errors:
 * - 400: No IDs provided or invalid format
 */
router.post('/knowledge-base/bulk-delete', adminCheck, async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new AppError('Document IDs array is required', 400, 'VALIDATION_ERROR');
    }

    if (ids.length > 100) {
      throw new AppError('Maximum 100 documents per delete operation', 400, 'VALIDATION_ERROR');
    }

    let deleted = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await deleteDocument(id);
        deleted++;
      } catch (err) {
        failed++;
      }
    }

    res.json({
      success: deleted > 0,
      deleted,
      failed,
      message: `Deleted ${deleted} of ${ids.length} documents`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/knowledge-base/bulk-import
 *
 * Bulk import multiple documents at once.
 * Accepts an array of documents parsed from JSON or CSV files.
 *
 * Request Body:
 * - documents {Array} - Array of document objects
 *
 * Response:
 * - imported: Number of successfully imported documents
 * - failed: Number of documents that failed to import
 * - errors: Array of error messages for failed documents
 */
router.post('/knowledge-base/bulk-import', adminCheck, async (req, res, next) => {
  try {
    const { documents } = req.body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      throw new AppError('Documents array is required', 400, 'VALIDATION_ERROR');
    }

    if (documents.length > 500) {
      throw new AppError('Maximum 500 documents per import', 400, 'VALIDATION_ERROR');
    }

    let imported = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      try {
        if (!doc.title || !doc.category || !doc.content) {
          throw new Error(`Missing required fields (title, category, content)`);
        }

        let keywords = doc.keywords || [];
        if (typeof keywords === 'string') {
          keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
        }

        await addDocument(doc.title, doc.category, doc.content, keywords);
        imported++;
      } catch (err) {
        failed++;
        errors.push({
          index: i,
          title: doc.title || `Document ${i + 1}`,
          error: err.message
        });
      }
    }

    res.status(imported > 0 ? 201 : 400).json({
      success: imported > 0,
      imported,
      failed,
      errors: errors.slice(0, 10),
      message: `Imported ${imported} of ${documents.length} documents`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/knowledge-base/:id
 *
 * Update an existing document in the knowledge base.
 *
 * Path Parameters:
 * - id {uuid} - Document ID
 *
 * Request Body:
 * - title {string} - New title (required)
 * - category {string} - New category (required)
 * - content {string} - New content (required)
 * - keywords {string[]} - New keywords (optional)
 *
 * Response:
 * - document: The updated document
 *
 * Errors:
 * - 400: Missing required fields
 * - 404: Document not found
 */
router.put('/knowledge-base/:id', adminCheck, async (req, res, next) => {
  try {
    const { title, category, content, keywords = [] } = req.body;

    // Validate required fields
    if (!title || !category || !content) {
      throw new AppError('Title, category, and content are required', 400, 'VALIDATION_ERROR');
    }

    // Verify document exists before updating
    const existing = await getDocument(req.params.id);
    if (!existing) {
      throw new AppError('Document not found', 404, 'NOT_FOUND');
    }

    const document = await updateDocument(req.params.id, title, category, content, keywords);

    res.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        category: document.category,
        content: document.content,
        keywords: document.keywords || [],
        createdAt: document.created_at,
        updatedAt: document.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/knowledge-base/:id
 *
 * Delete a document from the knowledge base.
 * The document will no longer be available for RAG retrieval.
 *
 * Path Parameters:
 * - id {uuid} - Document ID
 *
 * Response:
 * - message: Success confirmation
 *
 * Errors:
 * - 404: Document not found
 */
router.delete('/knowledge-base/:id', adminCheck, async (req, res, next) => {
  try {
    // Verify document exists before deleting
    const existing = await getDocument(req.params.id);
    if (!existing) {
      throw new AppError('Document not found', 404, 'NOT_FOUND');
    }

    await deleteDocument(req.params.id);

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SPARE PARTS CATALOG ROUTES
// CRUD operations for vehicle spare parts with exact CSV schema
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize spare parts table on first request.
 * This ensures the table exists before any operations.
 */
let sparePartsTableInitialized = false;
async function ensureSparePartsTable() {
  if (!sparePartsTableInitialized) {
    await initSparePartsTable();
    sparePartsTableInitialized = true;
  }
}

/**
 * GET /api/admin/spare-parts
 *
 * List all spare parts in the catalog with optional filtering.
 *
 * Query Parameters:
 * - category {string} - Filter by part category (optional)
 * - make {string} - Filter by vehicle make (optional)
 * - stockStatus {string} - Filter by stock status (optional)
 *
 * Response:
 * - parts: Array of spare part objects
 * - categories: List of all available categories
 * - makes: List of all available vehicle makes
 * - total: Total count of parts (with filters applied)
 */
router.get('/spare-parts', adminCheck, async (req, res, next) => {
  try {
    await ensureSparePartsTable();

    const { category, make, stockStatus } = req.query;
    const filters = {};
    if (category) filters.category = category;
    if (make) filters.make = make;
    if (stockStatus) filters.stockStatus = stockStatus;

    const parts = await getAllSpareParts(filters);
    const categories = await getPartCategories();
    const makes = await getAllMakes();

    res.json({
      success: true,
      parts: parts.map(part => ({
        id: part.id,
        vehicleMake: part.vehicle_make,
        vehicleModel: part.vehicle_model,
        yearFrom: part.year_from,
        yearTo: part.year_to,
        partNumber: part.part_number,
        partCategory: part.part_category,
        partDescription: part.part_description,
        priceGbp: parseFloat(part.price_gbp),
        priceUsd: parseFloat(part.price_usd),
        stockStatus: part.stock_status,
        compatibilityNotes: part.compatibility_notes,
        createdAt: part.created_at,
        updatedAt: part.updated_at
      })),
      categories,
      makes,
      total: parts.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/spare-parts/models/:make
 *
 * Get all models available for a specific vehicle make.
 *
 * Path Parameters:
 * - make {string} - Vehicle manufacturer
 *
 * Response:
 * - models: Array of model names
 */
router.get('/spare-parts/models/:make', adminCheck, async (req, res, next) => {
  try {
    await ensureSparePartsTable();
    const models = await getModelsByMake(req.params.make);

    res.json({
      success: true,
      models
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/spare-parts/:id
 *
 * Get a single spare part by ID.
 *
 * Path Parameters:
 * - id {number} - Spare part ID
 *
 * Response:
 * - part: Full spare part object
 *
 * Errors:
 * - 404: Spare part not found
 */
router.get('/spare-parts/:id', adminCheck, async (req, res, next) => {
  try {
    await ensureSparePartsTable();
    const part = await getSparePartById(parseInt(req.params.id));

    if (!part) {
      throw new AppError('Spare part not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      part: {
        id: part.id,
        vehicleMake: part.vehicle_make,
        vehicleModel: part.vehicle_model,
        yearFrom: part.year_from,
        yearTo: part.year_to,
        partNumber: part.part_number,
        partCategory: part.part_category,
        partDescription: part.part_description,
        priceGbp: parseFloat(part.price_gbp),
        priceUsd: parseFloat(part.price_usd),
        stockStatus: part.stock_status,
        compatibilityNotes: part.compatibility_notes,
        createdAt: part.created_at,
        updatedAt: part.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/spare-parts
 *
 * Create a new spare part in the catalog.
 *
 * Request Body (exact CSV format):
 * - vehicle_make {string} - Vehicle manufacturer (required)
 * - vehicle_model {string} - Vehicle model (required)
 * - year_from {number} - Start year (required)
 * - year_to {number} - End year (required)
 * - part_number {string} - Unique part identifier (required)
 * - part_category {string} - Part category (required)
 * - part_description {string} - Description (required)
 * - price_gbp {number} - Price in GBP (required)
 * - price_usd {number} - Price in USD (required)
 * - stock_status {string} - Stock status (optional, default: 'In Stock')
 * - compatibility_notes {string} - Notes (optional)
 *
 * Response:
 * - part: The created spare part
 */
router.post('/spare-parts', adminCheck, async (req, res, next) => {
  try {
    await ensureSparePartsTable();

    const {
      vehicle_make, vehicle_model, year_from, year_to,
      part_number, part_category, part_description,
      price_gbp, price_usd, stock_status, compatibility_notes
    } = req.body;

    // Validate required fields
    if (!vehicle_make || !vehicle_model || !year_from || !year_to ||
        !part_number || !part_category || !part_description ||
        price_gbp === undefined || price_usd === undefined) {
      throw new AppError('All required fields must be provided', 400, 'VALIDATION_ERROR');
    }

    const part = await addSparePart({
      vehicle_make, vehicle_model, year_from, year_to,
      part_number, part_category, part_description,
      price_gbp, price_usd, stock_status, compatibility_notes
    });

    res.status(201).json({
      success: true,
      part: {
        id: part.id,
        vehicleMake: part.vehicle_make,
        vehicleModel: part.vehicle_model,
        yearFrom: part.year_from,
        yearTo: part.year_to,
        partNumber: part.part_number,
        partCategory: part.part_category,
        partDescription: part.part_description,
        priceGbp: parseFloat(part.price_gbp),
        priceUsd: parseFloat(part.price_usd),
        stockStatus: part.stock_status,
        compatibilityNotes: part.compatibility_notes,
        createdAt: part.created_at,
        updatedAt: part.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/spare-parts/:id
 *
 * Update an existing spare part.
 *
 * Path Parameters:
 * - id {number} - Spare part ID
 *
 * Request Body: Same as POST (all fields required)
 *
 * Response:
 * - part: The updated spare part
 *
 * Errors:
 * - 404: Spare part not found
 */
router.put('/spare-parts/:id', adminCheck, async (req, res, next) => {
  try {
    await ensureSparePartsTable();

    const existing = await getSparePartById(parseInt(req.params.id));
    if (!existing) {
      throw new AppError('Spare part not found', 404, 'NOT_FOUND');
    }

    const {
      vehicle_make, vehicle_model, year_from, year_to,
      part_number, part_category, part_description,
      price_gbp, price_usd, stock_status, compatibility_notes
    } = req.body;

    // Validate required fields
    if (!vehicle_make || !vehicle_model || !year_from || !year_to ||
        !part_number || !part_category || !part_description ||
        price_gbp === undefined || price_usd === undefined) {
      throw new AppError('All required fields must be provided', 400, 'VALIDATION_ERROR');
    }

    const part = await updateSparePart(parseInt(req.params.id), {
      vehicle_make, vehicle_model, year_from, year_to,
      part_number, part_category, part_description,
      price_gbp, price_usd, stock_status, compatibility_notes
    });

    res.json({
      success: true,
      part: {
        id: part.id,
        vehicleMake: part.vehicle_make,
        vehicleModel: part.vehicle_model,
        yearFrom: part.year_from,
        yearTo: part.year_to,
        partNumber: part.part_number,
        partCategory: part.part_category,
        partDescription: part.part_description,
        priceGbp: parseFloat(part.price_gbp),
        priceUsd: parseFloat(part.price_usd),
        stockStatus: part.stock_status,
        compatibilityNotes: part.compatibility_notes,
        createdAt: part.created_at,
        updatedAt: part.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/spare-parts/:id
 *
 * Delete a spare part from the catalog.
 *
 * Path Parameters:
 * - id {number} - Spare part ID
 *
 * Response:
 * - message: Success confirmation
 *
 * Errors:
 * - 404: Spare part not found
 */
router.delete('/spare-parts/:id', adminCheck, async (req, res, next) => {
  try {
    await ensureSparePartsTable();

    const existing = await getSparePartById(parseInt(req.params.id));
    if (!existing) {
      throw new AppError('Spare part not found', 404, 'NOT_FOUND');
    }

    await deleteSparePart(parseInt(req.params.id));

    res.json({
      success: true,
      message: 'Spare part deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/spare-parts/search
 *
 * Search spare parts using the RAG algorithm.
 * Useful for testing how parts will be found during conversations.
 *
 * Request Body:
 * - query {string} - Search query (required)
 * - limit {number} - Max results (default: 5)
 *
 * Response:
 * - parts: Array of matching spare parts with relevance scores
 */
router.post('/spare-parts/search', adminCheck, async (req, res, next) => {
  try {
    await ensureSparePartsTable();

    const { query, limit = 5 } = req.body;

    if (!query) {
      throw new AppError('Search query is required', 400, 'VALIDATION_ERROR');
    }

    const parts = await searchSpareParts(query, limit);

    res.json({
      success: true,
      parts: parts.map(part => ({
        id: part.id,
        vehicleMake: part.vehicle_make,
        vehicleModel: part.vehicle_model,
        yearFrom: part.year_from,
        yearTo: part.year_to,
        partNumber: part.part_number,
        partCategory: part.part_category,
        partDescription: part.part_description,
        priceGbp: parseFloat(part.price_gbp),
        priceUsd: parseFloat(part.price_usd),
        stockStatus: part.stock_status,
        compatibilityNotes: part.compatibility_notes,
        relevanceScore: part.relevance_score
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/spare-parts/bulk-delete
 *
 * Bulk delete multiple spare parts at once.
 * Permanently removes parts from the catalog.
 * Uses POST instead of DELETE to reliably send body data.
 *
 * Request Body:
 * - ids {Array<number>} - Array of spare part IDs to delete
 *
 * Response:
 * - deleted: Number of successfully deleted parts
 * - failed: Number of parts that failed to delete
 *
 * Errors:
 * - 400: No IDs provided or invalid format
 */
router.post('/spare-parts/bulk-delete', adminCheck, async (req, res, next) => {
  try {
    await ensureSparePartsTable();

    const { ids } = req.body;

    // Validate input
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new AppError('Part IDs array is required', 400, 'VALIDATION_ERROR');
    }

    // Limit bulk delete size
    if (ids.length > 100) {
      throw new AppError('Maximum 100 parts per delete operation', 400, 'VALIDATION_ERROR');
    }

    let deleted = 0;
    let failed = 0;

    // Delete each part
    for (const id of ids) {
      try {
        await deleteSparePart(parseInt(id));
        deleted++;
      } catch (err) {
        failed++;
      }
    }

    res.json({
      success: deleted > 0,
      deleted,
      failed,
      message: `Deleted ${deleted} of ${ids.length} parts`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/spare-parts/bulk-status
 *
 * Bulk update stock status for multiple spare parts.
 *
 * Request Body:
 * - ids {Array<number>} - Array of spare part IDs to update
 * - stockStatus {string} - New stock status ('In Stock', 'Low Stock', 'Out of Stock')
 *
 * Response:
 * - updated: Number of successfully updated parts
 * - failed: Number of parts that failed to update
 *
 * Errors:
 * - 400: No IDs provided, invalid format, or invalid status
 */
router.put('/spare-parts/bulk-status', adminCheck, async (req, res, next) => {
  try {
    await ensureSparePartsTable();

    const { ids, stockStatus } = req.body;

    // Validate input
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new AppError('Part IDs array is required', 400, 'VALIDATION_ERROR');
    }

    const validStatuses = ['In Stock', 'Low Stock', 'Out of Stock'];
    if (!stockStatus || !validStatuses.includes(stockStatus)) {
      throw new AppError(`Stock status must be one of: ${validStatuses.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    // Limit bulk update size
    if (ids.length > 100) {
      throw new AppError('Maximum 100 parts per update operation', 400, 'VALIDATION_ERROR');
    }

    let updated = 0;
    let failed = 0;

    // Update each part's status
    for (const id of ids) {
      try {
        const part = await getSparePartById(parseInt(id));
        if (part) {
          await updateSparePart(parseInt(id), {
            vehicle_make: part.vehicle_make,
            vehicle_model: part.vehicle_model,
            year_from: part.year_from,
            year_to: part.year_to,
            part_number: part.part_number,
            part_category: part.part_category,
            part_description: part.part_description,
            price_gbp: part.price_gbp,
            price_usd: part.price_usd,
            stock_status: stockStatus,
            compatibility_notes: part.compatibility_notes
          });
          updated++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }

    res.json({
      success: updated > 0,
      updated,
      failed,
      message: `Updated ${updated} of ${ids.length} parts to "${stockStatus}"`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/spare-parts/bulk-import
 *
 * Bulk import spare parts from CSV data.
 * Accepts array of objects matching exact CSV column format.
 * Updates existing parts if part_number already exists.
 *
 * Request Body:
 * - parts {Array} - Array of spare part objects with CSV columns:
 *   - vehicle_make, vehicle_model, year_from, year_to
 *   - part_number, part_category, part_description
 *   - price_gbp, price_usd, stock_status, compatibility_notes
 *
 * Response:
 * - imported: Number of new parts imported
 * - updated: Number of existing parts updated
 * - failed: Number of parts that failed
 * - errors: Array of error details (first 10)
 */
router.post('/spare-parts/bulk-import', adminCheck, async (req, res, next) => {
  try {
    await ensureSparePartsTable();

    const { parts } = req.body;

    // Validate input
    if (!parts || !Array.isArray(parts) || parts.length === 0) {
      throw new AppError('Parts array is required', 400, 'VALIDATION_ERROR');
    }

    // Limit bulk import size
    if (parts.length > 1000) {
      throw new AppError('Maximum 1000 parts per import', 400, 'VALIDATION_ERROR');
    }

    const result = await bulkImportSpareParts(parts);

    res.status(result.imported > 0 || result.updated > 0 ? 201 : 400).json({
      success: result.imported > 0 || result.updated > 0,
      imported: result.imported,
      updated: result.updated,
      failed: result.failed,
      errors: result.errors.slice(0, 10),
      message: `Imported ${result.imported} new, updated ${result.updated} existing, ${result.failed} failed`
    });
  } catch (error) {
    next(error);
  }
});

export default router;
