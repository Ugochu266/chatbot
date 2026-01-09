/**
 * Chat Container Component
 *
 * This is the main chat interface component that orchestrates the entire
 * conversation experience. It manages:
 * - Conversation initialization (create or load)
 * - Message sending and receiving
 * - Real-time response streaming
 * - Error display and handling
 *
 * Component Hierarchy:
 * ChatContainer
 * ├── MessageList (displays conversation)
 * └── ChatInput (user input)
 *
 * State Flow:
 * 1. On mount: Create new conversation or load existing one
 * 2. User types message in ChatInput
 * 3. On send: Add user message + assistant placeholder
 * 4. API call sends message to server
 * 5. Response replaces placeholder with actual content
 *
 * Message Structure:
 * - id: Unique identifier (temp-* for pending messages)
 * - role: 'user' | 'assistant'
 * - content: Message text
 * - createdAt: ISO timestamp
 * - isProcessing: Boolean, shows loading state
 * - isError: Boolean, indicates error message
 *
 * @module components/ChatContainer
 */

import React, { useEffect, useCallback, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { useConversation } from '../hooks/useConversation';
import { useMessages } from '../hooks/useMessages';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main chat interface component.
 *
 * @param {Object} props - Component props
 * @param {string} [props.conversationId] - ID of conversation to load (optional)
 *   If not provided, creates a new conversation
 * @param {Function} [props.onConversationCreate] - Callback when new conversation created
 *   Receives (conversationId) - useful for updating URL or parent state
 * @returns {React.ReactElement} The chat container with messages and input
 */
function ChatContainer({ conversationId, onConversationCreate }) {
  // ─────────────────────────────────────────────────────────────────────────────
  // LOCAL STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [showError, setShowError] = useState(false);      // Error toast visibility
  const [processing, setProcessing] = useState(false);    // API call in progress

  // ─────────────────────────────────────────────────────────────────────────────
  // CONVERSATION HOOK
  // Manages conversation CRUD and message state
  // ─────────────────────────────────────────────────────────────────────────────
  const {
    conversation,
    loading: conversationLoading,
    error: conversationError,
    createConversation,
    loadConversation,
    addMessage,
    updateLastMessage,
    replaceLastMessage
  } = useConversation();

  // ─────────────────────────────────────────────────────────────────────────────
  // STREAMING UPDATE HANDLER
  // Callback passed to useMessages hook for real-time updates
  // ─────────────────────────────────────────────────────────────────────────────
  const handleMessageUpdate = useCallback((type, data) => {
    if (type === 'content') {
      // Append streaming content to the last message
      updateLastMessage(data);
    }
  }, [updateLastMessage]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MESSAGE HOOK
  // Handles message sending with streaming support
  // ─────────────────────────────────────────────────────────────────────────────
  const {
    sendMessage,
    isLoading: messageLoading,
    error: messageError,
    streaming
  } = useMessages(conversation?.id, handleMessageUpdate);

  // ─────────────────────────────────────────────────────────────────────────────
  // CONVERSATION INITIALIZATION EFFECT
  // Runs on mount to either load existing or create new conversation
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const initConversation = async () => {
      if (conversationId) {
        // Load existing conversation by ID
        await loadConversation(conversationId);
      } else {
        // Create new conversation and notify parent
        const newConv = await createConversation();
        onConversationCreate?.(newConv.id);
      }
    };
    initConversation();
  }, [conversationId, loadConversation, createConversation, onConversationCreate]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR HANDLING
  // Combine errors from both hooks and manage toast visibility
  // ─────────────────────────────────────────────────────────────────────────────
  const error = conversationError || messageError;

  useEffect(() => {
    if (error) {
      setShowError(true);
      // Auto-hide error toast after 6 seconds
      const timer = setTimeout(() => setShowError(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MESSAGE SEND HANDLER
  // Main function called when user submits a message
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSend = async (content) => {
    // ─────────────────────────────────────────────────────────────────────────
    // OPTIMISTIC UI UPDATE
    // Add user message immediately (before API call completes)
    // ─────────────────────────────────────────────────────────────────────────
    const userMessage = {
      id: `temp-${Date.now()}`,           // Temporary ID until server assigns real one
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    addMessage(userMessage);

    // ─────────────────────────────────────────────────────────────────────────
    // ASSISTANT PLACEHOLDER
    // Show "thinking" state while waiting for AI response
    // ─────────────────────────────────────────────────────────────────────────
    const assistantPlaceholder = {
      id: `temp-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isProcessing: true                   // Triggers loading indicator in MessageBubble
    };
    addMessage(assistantPlaceholder);
    setProcessing(true);

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // API CALL
      // Send message and wait for response
      // ─────────────────────────────────────────────────────────────────────────
      const result = await sendMessage(content);

      // ─────────────────────────────────────────────────────────────────────────
      // SUCCESS: Replace placeholder with actual response
      // ─────────────────────────────────────────────────────────────────────────
      if (result?.assistantMessage) {
        replaceLastMessage({
          id: result.assistantMessage.id,
          role: 'assistant',
          content: result.assistantMessage.content,
          createdAt: result.assistantMessage.createdAt,
          isProcessing: false
        });
      }
    } catch (err) {
      // ─────────────────────────────────────────────────────────────────────────
      // ERROR: Replace placeholder with error message
      // ─────────────────────────────────────────────────────────────────────────
      replaceLastMessage({
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        createdAt: new Date().toISOString(),
        isProcessing: false,
        isError: true                       // Triggers error styling in MessageBubble
      });
    } finally {
      setProcessing(false);
    }
  };

  // Combined loading state for UI
  const isLoading = conversationLoading || messageLoading;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 bg-white overflow-hidden relative">
      {/* Message Display Area */}
      <MessageList
        messages={conversation?.messages || []}
        streaming={streaming}
        processing={processing}
      />

      {/* User Input Area */}
      <ChatInput
        onSend={handleSend}
        disabled={isLoading || !conversation || processing}
      />

      {/* Error Toast Notification */}
      {showError && error && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
          <button
            onClick={() => setShowError(false)}
            className="ml-2 hover:bg-white/10 rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default ChatContainer;
