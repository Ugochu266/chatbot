import { Router } from 'express';
import {
  createConversation,
  getConversationWithMessages,
  listConversations
} from '../db/conversations.js';
import { validateConversationId, validatePagination } from '../middleware/validator.js';
import { conversationRateLimiter } from '../middleware/rateLimiter.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// POST /api/conversations - Create new conversation
router.post('/', conversationRateLimiter, async (req, res, next) => {
  try {
    const conversation = await createConversation(req.sessionId);

    res.status(201).json({
      success: true,
      conversation: {
        id: conversation.id,
        sessionId: conversation.session_id,
        createdAt: conversation.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/conversations - List conversations for session
router.get('/', validatePagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await listConversations(req.sessionId, page, limit);

    res.json({
      success: true,
      conversations: result.conversations.map(c => ({
        id: c.id,
        messageCount: parseInt(c.message_count),
        escalated: c.escalated,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/conversations/:id - Get conversation with messages
router.get('/:id', validateConversationId, async (req, res, next) => {
  try {
    const conversation = await getConversationWithMessages(req.params.id);

    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'NOT_FOUND');
    }

    // Verify session ownership
    if (conversation.session_id !== req.sessionId) {
      throw new AppError('Access denied', 403, 'FORBIDDEN');
    }

    res.json({
      success: true,
      conversation: {
        id: conversation.id,
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

export default router;
