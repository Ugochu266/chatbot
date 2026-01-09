/**
 * Message List Component
 *
 * This component displays the conversation history in SafeChat.
 * It renders a scrollable list of messages with auto-scroll behavior
 * and an empty state for new conversations.
 *
 * Features:
 * - Auto-scroll to newest message
 * - Empty state with welcome message
 * - Streaming indicator for active responses
 * - Smooth scroll animation
 *
 * Performance Note:
 * Uses a ref-based scroll-to-bottom approach which is more efficient
 * than scrolling the container directly, especially with smooth scrolling.
 *
 * @module components/MessageList
 */

import React, { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import MessageBubble from './MessageBubble';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scrollable message list with auto-scroll to bottom.
 *
 * @param {Object} props - Component props
 * @param {Array} props.messages - Array of message objects to display
 *   Each message: { id, role, content, createdAt, isProcessing?, isError? }
 * @param {boolean} props.streaming - Whether AI is currently streaming a response
 *   Passed to MessageBubble for cursor animation
 * @param {boolean} [props.processing] - Whether a message is being processed
 *   Currently unused but available for future loading states
 * @returns {React.ReactElement} The message list or empty state
 */
function MessageList({ messages, streaming }) {
  // ─────────────────────────────────────────────────────────────────────────────
  // SCROLL TO BOTTOM REF
  // Invisible element at the bottom used as scroll target
  // ─────────────────────────────────────────────────────────────────────────────
  const bottomRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTO-SCROLL EFFECT
  // Scroll to bottom whenever messages change (new message or streaming update)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─────────────────────────────────────────────────────────────────────────────
  // EMPTY STATE
  // Shown when there are no messages (new conversation)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
        {/* Icon Container */}
        <div className="bg-muted rounded-full p-4 mb-4">
          <MessageSquare className="h-8 w-8" />
        </div>

        {/* Welcome Text */}
        <h2 className="text-lg font-medium text-foreground mb-2">Welcome to SafeChat</h2>
        <p className="text-sm text-center max-w-sm">
          I'm here to help you with customer support questions.
          Type a message below to get started.
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MESSAGE LIST RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id || index}
          message={message}
          // Show streaming cursor only on the last assistant message while streaming
          isStreaming={streaming && index === messages.length - 1 && message.role === 'assistant'}
        />
      ))}

      {/* Invisible scroll anchor at bottom */}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
