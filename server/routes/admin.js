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

// Simple admin check middleware (for demo purposes)
// In production, implement proper authentication
function adminCheck(req, res, next) {
  const adminKey = req.headers['x-admin-key'];

  // For demo: accept any non-empty admin key
  // In production: validate against secure stored key
  if (!adminKey || adminKey.length < 8) {
    throw new AppError('Admin access required', 401, 'UNAUTHORIZED');
  }

  next();
}

// GET /api/admin/escalations - List escalated conversations
router.get('/escalations', adminCheck, validatePagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await getEscalatedConversations(page, limit);

    res.json({
      success: true,
      escalations: result.conversations.map(c => ({
        id: c.id,
        sessionId: c.session_id,
        escalationReason: c.escalation_reason,
        lastMessage: c.last_message,
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

// GET /api/admin/escalations/:id - Get full escalated conversation
router.get('/escalations/:id', adminCheck, validateConversationId, async (req, res, next) => {
  try {
    const conversation = await getConversationWithMessages(req.params.id);

    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'NOT_FOUND');
    }

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
        messages: conversation.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
          flagged: m.moderation_flagged
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/moderation-logs - Get flagged moderation logs
router.get('/moderation-logs', adminCheck, validatePagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const logs = await getFlaggedLogs(page, limit);

    res.json({
      success: true,
      logs: logs.map(log => ({
        id: log.id,
        messageId: log.message_id,
        messageContent: log.content,
        messageRole: log.role,
        flagged: log.flagged,
        categories: log.categories,
        scores: log.scores,
        createdAt: log.created_at
      }))
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/stats - Get basic statistics
router.get('/stats', adminCheck, async (req, res, next) => {
  try {
    // Get conversation stats
    const conversationStats = await sql`
      SELECT
        COUNT(*) as total_conversations,
        COUNT(*) FILTER (WHERE escalated = true) as escalated_conversations,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as conversations_last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as conversations_last_7d
      FROM conversations
    `;

    // Get message stats
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

    // Get moderation stats
    const moderationStats = await sql`
      SELECT
        COUNT(*) as total_moderation_events,
        COUNT(*) FILTER (WHERE flagged = true) as flagged_events
      FROM moderation_logs
    `;

    // Get knowledge base stats
    const knowledgeStats = await sql`
      SELECT
        COUNT(*) as total_documents,
        COUNT(DISTINCT category) as total_categories
      FROM knowledge_base
    `;

    // Get recent activity (last 7 days by day)
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

// ============================================
// Knowledge Base Management Routes
// ============================================

// GET /api/admin/knowledge-base - List all documents
router.get('/knowledge-base', adminCheck, async (req, res, next) => {
  try {
    const { category } = req.query;

    let documents;
    if (category) {
      documents = await getDocumentsByCategory(category);
    } else {
      documents = await sql`
        SELECT id, title, category, content, keywords, updated_at
        FROM knowledge_base
        ORDER BY category, title
      `;
    }

    const categories = await getAllCategories();

    res.json({
      success: true,
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        keywords: doc.keywords || [],
        updatedAt: doc.updated_at
      })),
      categories
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/knowledge-base/:id - Get single document
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

// POST /api/admin/knowledge-base - Create document
router.post('/knowledge-base', adminCheck, async (req, res, next) => {
  try {
    const { title, category, content, keywords = [] } = req.body;

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

// PUT /api/admin/knowledge-base/:id - Update document
router.put('/knowledge-base/:id', adminCheck, async (req, res, next) => {
  try {
    const { title, category, content, keywords = [] } = req.body;

    if (!title || !category || !content) {
      throw new AppError('Title, category, and content are required', 400, 'VALIDATION_ERROR');
    }

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

// DELETE /api/admin/knowledge-base/:id - Delete document
router.delete('/knowledge-base/:id', adminCheck, async (req, res, next) => {
  try {
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

// POST /api/admin/knowledge-base/search - Search documents
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

export default router;
