/**
 * Conversations Routes Module
 *
 * This module provides REST API endpoints for managing chat conversations.
 * Conversations are the container for messages between users and the AI assistant.
 *
 * Data Model:
 * - Each conversation belongs to a session (identified by session cookie)
 * - Conversations contain multiple messages (user and assistant)
 * - Conversations can be escalated for human review
 *
 * Endpoints:
 * - POST /api/conversations - Create a new conversation
 * - GET /api/conversations - List all conversations for current session
 * - GET /api/conversations/:id - Get a specific conversation with messages
 *
 * Security:
 * - All endpoints verify session ownership
 * - Users can only access their own conversations
 * - Session ID is set by sessionHandler middleware
 *
 * Base Path: /api/conversations
 *
 * @module routes/conversations
 */

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

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/conversations
 *
 * Create a new conversation for the current session.
 * The conversation is automatically associated with the user's session.
 *
 * A conversation must be created before messages can be exchanged.
 * The session ID is automatically extracted from the session cookie
 * by the sessionHandler middleware.
 *
 * Rate Limited:
 * - 5 conversations per minute per session
 * - Prevents spam conversation creation
 *
 * Response:
 * - conversation: The newly created conversation object with:
 *   - id: UUID for the conversation
 *   - sessionId: The owning session
 *   - createdAt: Timestamp
 *
 * Status Codes:
 * - 201: Conversation created successfully
 * - 429: Rate limit exceeded
 */
router.post('/', conversationRateLimiter, async (req, res, next) => {
  try {
    // Create a new conversation linked to the current session
    // Session ID comes from sessionHandler middleware (req.sessionId)
    const conversation = await createConversation(req.sessionId);

    // Return 201 Created with the new conversation
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

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION LISTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/conversations
 *
 * List all conversations for the current session with pagination.
 * Returns conversation metadata (not full message content).
 *
 * This endpoint is useful for:
 * - Showing conversation history in a sidebar
 * - Allowing users to resume previous conversations
 * - Displaying conversation statistics
 *
 * Query Parameters:
 * - page {number} - Page number (default: 1)
 * - limit {number} - Items per page (default: 20, max: 100)
 *
 * Response:
 * - conversations: Array of conversation summaries with:
 *   - id: Conversation UUID
 *   - messageCount: Number of messages in the conversation
 *   - escalated: Whether flagged for human review
 *   - createdAt/updatedAt: Timestamps
 * - pagination: Pagination metadata
 */
router.get('/', validatePagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;

    // Fetch conversations for the current session only
    // This ensures users only see their own conversations
    const result = await listConversations(req.sessionId, page, limit);

    res.json({
      success: true,
      conversations: result.conversations.map(c => ({
        id: c.id,
        messageCount: parseInt(c.message_count),  // Convert from PostgreSQL bigint
        escalated: c.escalated,                   // Flag for human review
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

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE CONVERSATION RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/conversations/:id
 *
 * Get a specific conversation with all its messages.
 * Used to load a conversation for display in the chat UI.
 *
 * Security:
 * - Validates that the conversation exists
 * - Verifies session ownership before returning data
 * - Returns 403 Forbidden if session doesn't match
 *
 * Path Parameters:
 * - id {uuid} - The conversation ID
 *
 * Response:
 * - conversation: Full conversation object with:
 *   - id, escalated, escalationReason
 *   - createdAt, updatedAt
 *   - messages: Array of all messages in chronological order
 *
 * Status Codes:
 * - 200: Success
 * - 403: Access denied (not your conversation)
 * - 404: Conversation not found
 */
router.get('/:id', validateConversationId, async (req, res, next) => {
  try {
    // Fetch conversation with all associated messages
    const conversation = await getConversationWithMessages(req.params.id);

    // Check if conversation exists
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'NOT_FOUND');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SESSION OWNERSHIP VERIFICATION
    // Critical security check: ensure users can only access their own conversations
    // The session_id stored with the conversation must match the requesting session
    // ─────────────────────────────────────────────────────────────────────────────
    if (conversation.session_id !== req.sessionId) {
      throw new AppError('Access denied', 403, 'FORBIDDEN');
    }

    res.json({
      success: true,
      conversation: {
        id: conversation.id,
        escalated: conversation.escalated,             // Was this flagged for human review?
        escalationReason: conversation.escalation_reason, // Why it was escalated
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        // Include all messages for this conversation
        messages: conversation.messages.map(m => ({
          id: m.id,
          role: m.role,                    // 'user' or 'assistant'
          content: m.content,              // The message text
          createdAt: m.created_at,
          flagged: m.moderation_flagged    // Was this message flagged by moderation?
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
