/**
 * Message Sending Hook
 *
 * This hook manages the message sending workflow in SafeChat, supporting
 * both traditional request/response and real-time streaming responses.
 *
 * Key Features:
 * - Non-streaming message sending (sendMessage)
 * - Streaming message sending via SSE (sendStreamingMessage)
 * - Stream cancellation support
 * - Loading and error state management
 *
 * State Management:
 * - sending: True during non-streaming request
 * - streaming: True during SSE stream
 * - error: Error message if request failed
 * - isLoading: Convenience combo (sending || streaming)
 *
 * Streaming Flow:
 * 1. User sends message
 * 2. SSE connection opens to server
 * 3. AI response arrives in chunks (onContent)
 * 4. Stream completes (onDone) or errors (onError)
 * 5. Connection closes automatically
 *
 * @module hooks/useMessages
 */

import { useState, useCallback, useRef } from 'react';
import { sendMessage as apiSendMessage, streamMessage } from '../services/messageService';

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for sending chat messages with streaming support.
 *
 * @param {string} conversationId - UUID of the active conversation
 * @param {Function} [onMessageUpdate] - Optional callback for stream events
 *   Called with (eventType, data) where eventType is 'content'|'done'|'error'
 * @returns {Object} Message sending state and functions:
 *   - sendMessage: Async function to send non-streaming message
 *   - sendStreamingMessage: Function to send with SSE streaming
 *   - cancelStream: Function to cancel active stream
 *   - sending: Boolean, true during non-streaming request
 *   - streaming: Boolean, true during SSE stream
 *   - error: Error message string or null
 *   - isLoading: Boolean, true if any operation in progress
 *
 * @example
 * function ChatInput() {
 *   const { sendStreamingMessage, isLoading, error } = useMessages(
 *     conversationId,
 *     (event, data) => console.log(event, data)
 *   );
 *
 *   const handleSend = (text) => {
 *     sendStreamingMessage(text, {
 *       onContent: (chunk) => appendToDisplay(chunk),
 *       onDone: () => console.log('Complete'),
 *       onError: (err) => console.error(err)
 *     });
 *   };
 *
 *   return <Input onSubmit={handleSend} disabled={isLoading} />;
 * }
 */
export function useMessages(conversationId, onMessageUpdate) {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // Track loading states and errors
  // ─────────────────────────────────────────────────────────────────────────────
  const [sending, setSending] = useState(false);    // Non-streaming request in progress
  const [streaming, setStreaming] = useState(false); // SSE stream in progress
  const [error, setError] = useState(null);          // Error message

  // ─────────────────────────────────────────────────────────────────────────────
  // STREAM ABORT REF
  // Stores cleanup function from streamMessage for cancellation
  // ─────────────────────────────────────────────────────────────────────────────
  const abortRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // NON-STREAMING MESSAGE SEND
  // Traditional request/response pattern - waits for complete AI response
  // ─────────────────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content) => {
    // Validate conversation exists
    if (!conversationId) {
      setError('No conversation selected');
      return null;
    }

    setSending(true);
    setError(null);

    try {
      // Send message and wait for complete response
      const result = await apiSendMessage(conversationId, content);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSending(false);
    }
  }, [conversationId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // STREAMING MESSAGE SEND
  // Uses SSE for real-time response streaming
  // ─────────────────────────────────────────────────────────────────────────────
  const sendStreamingMessage = useCallback((content, callbacks) => {
    // Validate conversation exists
    if (!conversationId) {
      setError('No conversation selected');
      return;
    }

    setStreaming(true);
    setError(null);

    const { onContent, onDone, onError } = callbacks;

    // Open SSE connection and store cleanup function
    abortRef.current = streamMessage(conversationId, content, {
      // ─────────────────────────────────────────────────────────────────────────
      // CONTENT CHUNK HANDLER
      // Called for each token/chunk from the AI response
      // ─────────────────────────────────────────────────────────────────────────
      onContent: (chunk) => {
        onContent?.(chunk);
        // Notify parent component of update
        onMessageUpdate?.('content', chunk);
      },

      // ─────────────────────────────────────────────────────────────────────────
      // STREAM COMPLETE HANDLER
      // Called when AI response is fully received
      // ─────────────────────────────────────────────────────────────────────────
      onDone: (data) => {
        setStreaming(false);
        onDone?.(data);
        onMessageUpdate?.('done', data);
      },

      // ─────────────────────────────────────────────────────────────────────────
      // ERROR HANDLER
      // Called on network error, server error, or blocked message
      // ─────────────────────────────────────────────────────────────────────────
      onError: (err) => {
        setStreaming(false);
        setError(err.message);
        onError?.(err);
        onMessageUpdate?.('error', err);
      }
    });
  }, [conversationId, onMessageUpdate]);

  // ─────────────────────────────────────────────────────────────────────────────
  // STREAM CANCELLATION
  // Allows user to stop waiting for AI response mid-stream
  // ─────────────────────────────────────────────────────────────────────────────
  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      // Call cleanup function from streamMessage
      abortRef.current();
      abortRef.current = null;
      setStreaming(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // RETURN HOOK API
  // ─────────────────────────────────────────────────────────────────────────────
  return {
    sendMessage,
    sendStreamingMessage,
    cancelStream,
    sending,
    streaming,
    error,
    isLoading: sending || streaming // Convenience flag for UI
  };
}
