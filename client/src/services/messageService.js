/**
 * Message Service Module
 *
 * This module provides API functions for sending and receiving chat messages.
 * It supports both traditional request/response messaging and real-time
 * streaming responses via Server-Sent Events (SSE).
 *
 * Messaging Flow:
 * 1. User sends message content + conversation ID
 * 2. Server processes through safety pipeline
 * 3. If safe, message is sent to OpenAI for response
 * 4. AI response is returned (streamed or complete)
 *
 * Safety Pipeline (server-side):
 * - Input sanitization (XSS prevention)
 * - OpenAI moderation API check
 * - Custom rule matching (blocked keywords, regex)
 * - Escalation detection (crisis, legal, etc.)
 *
 * API Endpoints Used:
 * - POST /api/messages - Send message (non-streaming)
 * - GET /api/messages/stream/:conversationId - SSE streaming
 *
 * @module services/messageService
 */

import { api, API_URL } from './api';

// ═══════════════════════════════════════════════════════════════════════════════
// NON-STREAMING MESSAGE API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send a message and receive the complete AI response.
 *
 * This is the simpler, non-streaming approach where the entire AI response
 * is returned in a single response. Good for simple integrations but
 * provides a slower perceived response time.
 *
 * Response Processing:
 * - If message is blocked: Returns block reason, no AI response
 * - If message triggers escalation: Returns both AI response and escalation flag
 * - Normal case: Returns AI response message
 *
 * @param {string} conversationId - UUID of the conversation
 * @param {string} content - The message text to send
 * @returns {Promise<Object>} Response containing:
 *   - userMessage: The saved user message
 *   - assistantMessage: The AI response (if not blocked)
 *   - blocked: Boolean if message was blocked
 *   - blockReason: Reason for blocking (if blocked)
 *   - escalated: Boolean if conversation was escalated
 *
 * @example
 * const result = await sendMessage(conversationId, 'Hello!');
 * if (!result.blocked) {
 *   console.log(result.assistantMessage.content);
 * }
 */
export async function sendMessage(conversationId, content) {
  const response = await api.post('/api/messages', {
    conversationId,
    content
  });
  return response.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING MESSAGE API (SSE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send a message and stream the AI response in real-time.
 *
 * Uses Server-Sent Events (SSE) to receive the AI response token-by-token
 * as it's generated. This provides a much better user experience with
 * immediate feedback and a "typing" effect.
 *
 * Event Types Received:
 * - 'content': Partial response text chunk
 * - 'done': Final event with complete message data
 * - 'error': Error occurred during processing
 *
 * Note: The message content is passed as a query parameter because SSE
 * uses GET requests. The server handles URL encoding.
 *
 * @param {string} conversationId - UUID of the conversation
 * @param {string} content - The message text to send
 * @param {Object} callbacks - Event handlers:
 *   - onContent(text): Called with each text chunk
 *   - onDone(data): Called when stream completes
 *   - onError(error): Called on error
 * @returns {Function} Cleanup function to close the connection
 *
 * @example
 * let response = '';
 * const cleanup = streamMessage(conversationId, 'Hello!', {
 *   onContent: (text) => {
 *     response += text;
 *     updateUI(response);
 *   },
 *   onDone: (data) => {
 *     console.log('Complete!', data);
 *   },
 *   onError: (error) => {
 *     console.error('Error:', error.message);
 *   }
 * });
 *
 * // To cancel:
 * cleanup();
 */
export function streamMessage(conversationId, content, callbacks) {
  const { onContent, onDone, onError } = callbacks;

  // ─────────────────────────────────────────────────────────────────────────────
  // BUILD SSE URL
  // Message is passed as query param since SSE uses GET
  // ─────────────────────────────────────────────────────────────────────────────
  const url = new URL(`${API_URL}/api/messages/stream/${conversationId}`);
  url.searchParams.set('message', content);

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE EVENT SOURCE CONNECTION
  // Browser-native SSE client that auto-reconnects on connection loss
  // ─────────────────────────────────────────────────────────────────────────────
  const eventSource = new EventSource(url.toString());

  // ─────────────────────────────────────────────────────────────────────────────
  // MESSAGE HANDLER
  // Process incoming SSE events based on type
  // ─────────────────────────────────────────────────────────────────────────────
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'content':
          // ─────────────────────────────────────────────────────────────────────
          // CONTENT CHUNK
          // Partial response text, append to display
          // ─────────────────────────────────────────────────────────────────────
          onContent?.(data.content);
          break;

        case 'done':
          // ─────────────────────────────────────────────────────────────────────
          // STREAM COMPLETE
          // Final event with message metadata, close connection
          // ─────────────────────────────────────────────────────────────────────
          onDone?.(data);
          eventSource.close();
          break;

        case 'error':
          // ─────────────────────────────────────────────────────────────────────
          // SERVER ERROR
          // Processing error (blocked, moderation, etc.)
          // ─────────────────────────────────────────────────────────────────────
          onError?.(new Error(data.message));
          eventSource.close();
          break;

        default:
          // Unknown event type - ignore
          break;
      }
    } catch (error) {
      // JSON parse error
      onError?.(error);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CONNECTION ERROR HANDLER
  // Handle network errors and connection drops
  // ─────────────────────────────────────────────────────────────────────────────
  eventSource.onerror = (error) => {
    onError?.(new Error('Connection lost'));
    eventSource.close();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CLEANUP FUNCTION
  // Return function to manually close connection (e.g., on component unmount)
  // ─────────────────────────────────────────────────────────────────────────────
  return () => {
    eventSource.close();
  };
}
