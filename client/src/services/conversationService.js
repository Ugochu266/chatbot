/**
 * Conversation Service Module
 *
 * This module provides API functions for managing conversations in SafeChat.
 * Conversations are the top-level containers for chat messages, belonging
 * to a specific user session.
 *
 * API Endpoints Used:
 * - POST /api/conversations - Create new conversation
 * - GET /api/conversations/:id - Get conversation with messages
 * - GET /api/conversations - List conversations (paginated)
 *
 * Data Model:
 * - Conversations belong to sessions (via session_id)
 * - Conversations contain messages
 * - Conversations can be escalated (requires human review)
 *
 * @module services/conversationService
 */

import { api } from './api';

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new conversation.
 *
 * Creates an empty conversation container for the current session.
 * Messages will be added to this conversation via the message service.
 *
 * The session ID is automatically attached via the API interceptor,
 * so the conversation is automatically associated with the current user.
 *
 * @returns {Promise<Object>} The created conversation object with id, created_at, etc.
 *
 * @example
 * const conversation = await createConversation();
 * console.log(conversation.id); // UUID of new conversation
 */
export async function createConversation() {
  const response = await api.post('/api/conversations');
  return response.data.conversation;
}

/**
 * Get a conversation with its messages.
 *
 * Retrieves a single conversation by ID, including all associated messages.
 * Only returns the conversation if it belongs to the current session
 * (enforced server-side).
 *
 * @param {string} id - UUID of the conversation to retrieve
 * @returns {Promise<Object>} Conversation object with messages array
 *
 * @example
 * const conversation = await getConversation('abc-123');
 * console.log(conversation.messages); // Array of messages
 */
export async function getConversation(id) {
  const response = await api.get(`/api/conversations/${id}`);
  return response.data.conversation;
}

/**
 * List all conversations for the current session.
 *
 * Returns a paginated list of conversations owned by the current session.
 * Useful for displaying conversation history or a sidebar with past chats.
 *
 * Note: Only conversations belonging to the current session are returned
 * (enforced server-side via session ID).
 *
 * @param {number} [page=1] - Page number (1-indexed)
 * @param {number} [limit=10] - Number of conversations per page
 * @returns {Promise<Object>} Object containing:
 *   - conversations: Array of conversation objects
 *   - pagination: { page, limit, total, totalPages }
 *
 * @example
 * const { conversations, pagination } = await listConversations(1, 10);
 * console.log(`Showing ${conversations.length} of ${pagination.total}`);
 */
export async function listConversations(page = 1, limit = 10) {
  const response = await api.get('/api/conversations', {
    params: { page, limit }
  });

  return {
    conversations: response.data.conversations,
    pagination: response.data.pagination
  };
}
