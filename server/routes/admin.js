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
        relevanceScore: doc.relevance_score  // How well it matched the query
      }))
    });
  } catch (error) {
    next(error);
  }
});

export default router;
