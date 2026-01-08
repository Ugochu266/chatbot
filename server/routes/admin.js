import { Router } from 'express';
import { getEscalatedConversations, getConversationWithMessages } from '../db/conversations.js';
import { getFlaggedLogs } from '../db/moderationLogs.js';
import { validatePagination, validateConversationId } from '../middleware/validator.js';
import { AppError } from '../middleware/errorHandler.js';

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
    // This would typically query aggregated stats from the database
    // For demo, return placeholder stats
    res.json({
      success: true,
      stats: {
        message: 'Stats endpoint - implement with actual database queries',
        note: 'Add queries for total conversations, messages, escalation rate, etc.'
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
