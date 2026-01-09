/**
 * Conversations Database Module
 *
 * This module handles all database operations for conversations in SafeChat.
 * Conversations are containers for message exchanges between users and the AI.
 *
 * Data Model:
 * - Conversations belong to sessions (identified by session_id)
 * - Conversations contain multiple messages (one-to-many)
 * - Conversations can be escalated for human review
 * - Timestamps track creation and last activity
 *
 * Table Schema (conversations):
 * - id: UUID primary key
 * - session_id: UUID linking to user session (for access control)
 * - escalated: Boolean flag for human review needed
 * - escalation_reason: Text explaining why escalated
 * - created_at: Creation timestamp
 * - updated_at: Last activity timestamp
 *
 * Security Model:
 * - Session ID is used for access control
 * - Users can only access conversations with matching session_id
 * - Escalated conversations are visible to admins regardless of session
 *
 * @module db/conversations
 */

import sql from './index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new conversation for a session.
 *
 * Creates an empty conversation container that messages will be added to.
 * The session_id links the conversation to a specific user session for
 * access control purposes.
 *
 * @param {string} sessionId - UUID of the user's session
 * @returns {Promise<Object>} The created conversation object
 *
 * @example
 * const conv = await createConversation('550e8400-e29b-41d4-a716-446655440000');
 * // conv.id can now be used to add messages
 */
export async function createConversation(sessionId) {
  const result = await sql`
    INSERT INTO conversations (session_id)
    VALUES (${sessionId})
    RETURNING *
  `;
  return result[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get a conversation by ID without messages.
 *
 * Retrieves the conversation metadata only. Use this for quick lookups
 * where you need to verify existence or check session ownership without
 * loading all messages.
 *
 * @param {string} id - UUID of the conversation
 * @returns {Promise<Object|null>} The conversation object or null if not found
 */
export async function getConversation(id) {
  const result = await sql`
    SELECT * FROM conversations WHERE id = ${id}
  `;
  return result[0] || null;
}

/**
 * Get a conversation with all its messages.
 *
 * Retrieves the full conversation including all messages in chronological
 * order. This is the primary method for loading a conversation for display
 * in the chat UI.
 *
 * @param {string} id - UUID of the conversation
 * @returns {Promise<Object|null>} Conversation object with messages array, or null
 *
 * @example
 * const conv = await getConversationWithMessages(convId);
 * // conv.messages contains all messages in chronological order
 * // conv.escalated indicates if flagged for human review
 */
export async function getConversationWithMessages(id) {
  // First get the conversation metadata
  const conversation = await getConversation(id);
  if (!conversation) return null;

  // Then fetch all messages for this conversation
  const messages = await sql`
    SELECT id, role, content, created_at, moderation_flagged
    FROM messages
    WHERE conversation_id = ${id}
    ORDER BY created_at ASC
  `;

  // Combine conversation data with messages
  return { ...conversation, messages };
}

/**
 * List conversations for a session with pagination.
 *
 * Returns a paginated list of conversations for a specific session,
 * sorted by most recent activity. Includes message count for each
 * conversation to show in the UI.
 *
 * @param {string} sessionId - UUID of the user's session
 * @param {number} [page=1] - Page number (1-indexed)
 * @param {number} [limit=10] - Items per page
 * @returns {Promise<Object>} Paginated result object containing:
 *   - conversations: Array of conversation objects with message_count
 *   - total: Total number of conversations
 *   - page: Current page number
 *   - limit: Items per page
 *   - totalPages: Total number of pages
 */
export async function listConversations(sessionId, page = 1, limit = 10) {
  // Calculate offset for pagination
  const offset = (page - 1) * limit;

  // ─────────────────────────────────────────────────────────────────────────────
  // FETCH CONVERSATIONS WITH MESSAGE COUNT
  // Subquery counts messages for each conversation (useful for UI display)
  // ─────────────────────────────────────────────────────────────────────────────
  const conversations = await sql`
    SELECT c.*,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    WHERE c.session_id = ${sessionId}
    ORDER BY c.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Get total count for pagination metadata
  const countResult = await sql`
    SELECT COUNT(*) as total FROM conversations WHERE session_id = ${sessionId}
  `;

  return {
    conversations,
    total: parseInt(countResult[0].total),
    page,
    limit,
    totalPages: Math.ceil(countResult[0].total / limit)
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESCALATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mark a conversation as escalated for human review.
 *
 * Called when the safety pipeline detects content requiring human attention.
 * Sets the escalated flag and records the reason for escalation.
 *
 * Escalation Triggers:
 * - Crisis keywords detected (self-harm, emergency)
 * - Legal threats or regulatory mentions
 * - Strong negative sentiment
 * - Content moderation flags
 *
 * @param {string} id - UUID of the conversation to escalate
 * @param {string} reason - Human-readable reason for escalation
 * @returns {Promise<Object>} The updated conversation object
 */
export async function updateEscalation(id, reason) {
  const result = await sql`
    UPDATE conversations
    SET escalated = true, escalation_reason = ${reason}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0];
}

/**
 * Get all escalated conversations for admin review.
 *
 * Returns a paginated list of all conversations that have been flagged
 * for human review. Includes the last message for quick context.
 * Used by the admin dashboard to manage escalation queue.
 *
 * @param {number} [page=1] - Page number (1-indexed)
 * @param {number} [limit=20] - Items per page
 * @returns {Promise<Object>} Paginated result with escalated conversations
 */
export async function getEscalatedConversations(page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  // ─────────────────────────────────────────────────────────────────────────────
  // FETCH ESCALATED CONVERSATIONS WITH LAST MESSAGE
  // Include last message for quick preview in admin dashboard
  // ─────────────────────────────────────────────────────────────────────────────
  const conversations = await sql`
    SELECT c.*,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM conversations c
    WHERE c.escalated = true
    ORDER BY c.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countResult = await sql`
    SELECT COUNT(*) as total FROM conversations WHERE escalated = true
  `;

  return {
    conversations,
    total: parseInt(countResult[0].total),
    page,
    limit
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMESTAMP MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update a conversation's timestamp to reflect recent activity.
 *
 * Called whenever a new message is added to keep the conversation's
 * updated_at current. This enables sorting conversations by recent
 * activity in the UI.
 *
 * @param {string} id - UUID of the conversation to update
 */
export async function updateConversationTimestamp(id) {
  await sql`
    UPDATE conversations SET updated_at = NOW() WHERE id = ${id}
  `;
}
