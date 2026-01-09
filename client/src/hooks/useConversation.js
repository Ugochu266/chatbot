/**
 * Conversation Management Hook
 *
 * This hook manages conversation state in SafeChat, handling CRUD operations
 * and real-time message updates. It's the primary state container for
 * the chat interface.
 *
 * Key Features:
 * - Create new conversations
 * - Load existing conversations with messages
 * - List all conversations for the session
 * - Real-time message management (add, update, replace)
 *
 * State Structure:
 * - conversation: Currently active conversation with messages array
 * - conversations: List of all conversations for conversation list UI
 * - loading: Boolean for async operation in progress
 * - error: Error message from failed operations
 *
 * Message Management:
 * The hook provides three methods for message updates to support streaming:
 * - addMessage: Add a complete new message
 * - updateLastMessage: Append content to last message (streaming)
 * - replaceLastMessage: Replace last message with final version
 *
 * @module hooks/useConversation
 */

import { useState, useCallback } from 'react';
import {
  createConversation as apiCreateConversation,
  getConversation as apiGetConversation,
  listConversations as apiListConversations
} from '../services/conversationService';

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for managing conversation state and operations.
 *
 * Provides comprehensive conversation management including CRUD operations
 * and message state updates for streaming support.
 *
 * @returns {Object} Conversation state and actions:
 *   - conversation: Active conversation object with messages
 *   - conversations: Array of conversation summaries
 *   - loading: Boolean, true during async operations
 *   - error: Error message string or null
 *   - createConversation: Async function to create new conversation
 *   - loadConversation: Async function to load conversation by ID
 *   - loadConversations: Async function to list conversations
 *   - addMessage: Function to add message to active conversation
 *   - updateLastMessage: Function to append to last message
 *   - replaceLastMessage: Function to replace last message
 *   - clearConversation: Function to clear active conversation
 *   - setConversation: Direct state setter for advanced use
 *
 * @example
 * function ChatApp() {
 *   const {
 *     conversation,
 *     loading,
 *     createConversation,
 *     addMessage,
 *     updateLastMessage
 *   } = useConversation();
 *
 *   const startChat = async () => {
 *     await createConversation();
 *   };
 *
 *   return (
 *     <div>
 *       {conversation?.messages.map(msg => <Message key={msg.id} {...msg} />)}
 *     </div>
 *   );
 * }
 */
export function useConversation() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [conversation, setConversation] = useState(null);  // Active conversation
  const [conversations, setConversations] = useState([]);   // Conversation list
  const [loading, setLoading] = useState(false);            // Loading state
  const [error, setError] = useState(null);                 // Error message

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONVERSATION CRUD OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Create a new conversation.
   *
   * Creates an empty conversation and sets it as active.
   * The messages array is initialized as empty.
   *
   * @returns {Promise<Object>} The created conversation object
   */
  const createConversation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const newConversation = await apiCreateConversation();

      // Set as active with empty messages array
      setConversation({
        ...newConversation,
        messages: []
      });

      return newConversation;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load an existing conversation with its messages.
   *
   * Fetches a conversation by ID and sets it as the active conversation.
   * The conversation includes all associated messages.
   *
   * @param {string} id - UUID of the conversation to load
   * @returns {Promise<Object>} The loaded conversation with messages
   */
  const loadConversation = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await apiGetConversation(id);
      setConversation(loaded);
      return loaded;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load list of conversations for the current session.
   *
   * Fetches paginated list of conversation summaries for the
   * conversation list sidebar/menu.
   *
   * @param {number} [page=1] - Page number (1-indexed)
   * @param {number} [limit=10] - Conversations per page
   * @returns {Promise<Object>} Result with conversations and pagination
   */
  const loadConversations = useCallback(async (page = 1, limit = 10) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiListConversations(page, limit);
      setConversations(result.conversations);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════════
  // MESSAGE STATE MANAGEMENT
  // These functions support real-time updates during message streaming
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Add a complete message to the active conversation.
   *
   * Used when:
   * - Adding the user's message before sending
   * - Adding a complete assistant message (non-streaming)
   *
   * @param {Object} message - Message object to add
   */
  const addMessage = useCallback((message) => {
    setConversation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [...prev.messages, message]
      };
    });
  }, []);

  /**
   * Append content to the last message in the conversation.
   *
   * Used during streaming to incrementally update the assistant's
   * response as chunks arrive. Creates a "typing" effect.
   *
   * @param {string} content - Content chunk to append
   */
  const updateLastMessage = useCallback((content) => {
    setConversation(prev => {
      // Safety check: need existing conversation with messages
      if (!prev || prev.messages.length === 0) return prev;

      // Clone messages array
      const messages = [...prev.messages];
      const lastIndex = messages.length - 1;

      // Append content to last message
      messages[lastIndex] = {
        ...messages[lastIndex],
        content: messages[lastIndex].content + content
      };

      return { ...prev, messages };
    });
  }, []);

  /**
   * Replace the last message entirely.
   *
   * Used after streaming completes to replace the accumulated
   * chunks with the final message object (includes ID, timestamps, etc.).
   *
   * @param {Object} newMessage - Complete message object to use as replacement
   */
  const replaceLastMessage = useCallback((newMessage) => {
    setConversation(prev => {
      // Safety check: need existing conversation with messages
      if (!prev || prev.messages.length === 0) return prev;

      // Clone and replace last message
      const messages = [...prev.messages];
      messages[messages.length - 1] = newMessage;

      return { ...prev, messages };
    });
  }, []);

  /**
   * Clear the active conversation.
   *
   * Resets the conversation state to null. Used when user wants
   * to start fresh without selecting a specific conversation.
   */
  const clearConversation = useCallback(() => {
    setConversation(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // RETURN HOOK API
  // ─────────────────────────────────────────────────────────────────────────────
  return {
    // State
    conversation,
    conversations,
    loading,
    error,

    // CRUD Operations
    createConversation,
    loadConversation,
    loadConversations,

    // Message Management
    addMessage,
    updateLastMessage,
    replaceLastMessage,
    clearConversation,

    // Direct state setter for advanced use cases
    setConversation
  };
}
