/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Messages Database Module
 *
 * This module handles all database operations for chat messages in the SafeChat
 * application. Messages are the core content unit - each user input and AI
 * response is stored as a message.
 *
 * Data Model:
 * - Messages belong to conversations (many-to-one relationship)
 * - Each message has a role ('user' or 'assistant')
 * - Messages track moderation flags, token usage, and response times
 * - Messages are ordered chronologically within conversations
 *
 * Table Schema (messages):
 * - id: UUID primary key
 * - conversation_id: Foreign key to conversations table
 * - role: 'user' or 'assistant'
 * - content: The message text
 * - tokens_used: OpenAI tokens consumed (assistant messages only)
 * - response_time_ms: Time taken to generate response
 * - moderation_flagged: Whether content was flagged by moderation
 * - created_at: Timestamp
 *
 * Integration Points:
 * - Called by message routes for CRUD operations
 * - Used by safety pipeline to flag messages
 * - Provides context for AI response generation
 *
 * @module db/messages
 */

import sql from './index.js';
import { updateConversationTimestamp } from './conversations.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new message in a conversation.
 *
 * This function inserts a message and updates the parent conversation's
 * timestamp to reflect recent activity. The conversation timestamp update
 * is important for sorting conversations by recency.
 *
 * @param {string} conversationId - UUID of the parent conversation
 * @param {string} role - Message role: 'user' or 'assistant'
 * @param {string} content - The message text content
 * @param {Object} [metadata={}] - Additional message metadata:
 *   - tokensUsed {number|null} - OpenAI tokens consumed (for assistant messages)
 *   - responseTimeMs {number|null} - Response generation time in milliseconds
 *   - moderationFlagged {boolean} - Whether content was flagged by moderation
 * @returns {Promise<Object>} The created message object with all fields
 *
 * @example
 * // Create user message
 * const userMsg = await createMessage(convId, 'user', 'How do I reset my password?');
 *
 * @example
 * // Create assistant message with metadata
 * const assistantMsg = await createMessage(convId, 'assistant', 'You can reset...', {
 *   tokensUsed: 150,
 *   responseTimeMs: 1234,
 *   moderationFlagged: false
 * });
 */
export async function createMessage(conversationId, role, content, metadata = {}) {
  // Extract metadata with defaults
  const { tokensUsed = null, responseTimeMs = null, moderationFlagged = false } = metadata;

  // Insert the message into the database
  const result = await sql`
    INSERT INTO messages (conversation_id, role, content, tokens_used, response_time_ms, moderation_flagged)
    VALUES (${conversationId}, ${role}, ${content}, ${tokensUsed}, ${responseTimeMs}, ${moderationFlagged})
    RETURNING *
  `;

  // ─────────────────────────────────────────────────────────────────────────────
  // UPDATE CONVERSATION TIMESTAMP
  // Keep the conversation's updated_at current for sorting by recent activity
  // ─────────────────────────────────────────────────────────────────────────────
  await updateConversationTimestamp(conversationId);

  return result[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get messages for a conversation with limit.
 *
 * Retrieves the most recent messages for a conversation, useful for
 * displaying chat history in the UI. Messages are returned in
 * chronological order (oldest first) for proper display.
 *
 * @param {string} conversationId - UUID of the conversation
 * @param {number} [limit=10] - Maximum number of messages to return
 * @returns {Promise<Array>} Array of message objects in chronological order
 *
 * @example
 * const messages = await getMessages(conversationId, 20);
 * // Returns last 20 messages, oldest first
 */
export async function getMessages(conversationId, limit = 10) {
  // Query messages in descending order (newest first) with limit
  const messages = await sql`
    SELECT id, role, content, created_at, moderation_flagged
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  // ─────────────────────────────────────────────────────────────────────────────
  // REVERSE FOR CHRONOLOGICAL ORDER
  // We query DESC to get the most recent, but display needs ASC order
  // ─────────────────────────────────────────────────────────────────────────────
  return messages.reverse();
}

/**
 * Get a single message by ID.
 *
 * Retrieves the full message record including all metadata fields.
 * Used for detailed message inspection or moderation logging.
 *
 * @param {string} id - UUID of the message
 * @returns {Promise<Object|null>} The message object or null if not found
 */
export async function getMessage(id) {
  const result = await sql`
    SELECT * FROM messages WHERE id = ${id}
  `;
  return result[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update the moderation flag on a message.
 *
 * Used to mark or unmark a message as flagged by content moderation.
 * This can be called after initial creation if moderation happens
 * asynchronously or needs to be updated by an admin.
 *
 * @param {string} id - UUID of the message to update
 * @param {boolean} flagged - New moderation flag value
 * @returns {Promise<Object>} The updated message object
 */
export async function updateModerationFlag(id, flagged) {
  const result = await sql`
    UPDATE messages
    SET moderation_flagged = ${flagged}
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT RETRIEVAL FOR AI
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get recent message context for AI response generation.
 *
 * Retrieves recent messages formatted for the OpenAI API. This provides
 * conversation context so the AI can generate relevant, contextual responses.
 *
 * The returned format matches OpenAI's expected message structure:
 * [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
 *
 * @param {string} conversationId - UUID of the conversation
 * @param {number} [limit=10] - Number of recent messages to include
 * @returns {Promise<Array>} Array of { role, content } objects in chronological order
 *
 * @example
 * const context = await getRecentContext(conversationId, 10);
 * // Pass to OpenAI: messages = [...systemPrompt, ...context, newMessage]
 */
export async function getRecentContext(conversationId, limit = 10) {
  // Fetch recent messages (newest first due to DESC)
  const messages = await sql`
    SELECT role, content
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  // ─────────────────────────────────────────────────────────────────────────────
  // FORMAT FOR OPENAI API
  // Reverse to chronological order and extract only role and content
  // ─────────────────────────────────────────────────────────────────────────────
  return messages.reverse().map(m => ({
    role: m.role,
    content: m.content
  }));
}
