/**
 * Message Bubble Component
 *
 * This component renders individual chat messages with appropriate styling
 * based on the message role (user/assistant) and state (processing/error/streaming).
 *
 * Visual States:
 * - User message: Right-aligned, primary color
 * - Assistant message: Left-aligned, muted background
 * - Processing: Shows "Thinking..." with spinner
 * - Streaming: Shows blinking cursor after text
 * - Error: Red/destructive styling
 *
 * Layout Structure:
 * [Avatar] [Message Bubble]
 *   or
 * [Message Bubble] [Avatar] (for user messages)
 *
 * @module components/MessageBubble
 */

import React from 'react';
import { User, Bot, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Individual message bubble with role-based styling.
 *
 * @param {Object} props - Component props
 * @param {Object} props.message - The message object:
 *   - role: 'user' | 'assistant'
 *   - content: Message text
 *   - createdAt: ISO timestamp
 *   - isProcessing: Boolean, shows loading state
 *   - isError: Boolean, error styling
 * @param {boolean} props.isStreaming - Whether this message is actively streaming
 *   Shows blinking cursor when true
 * @returns {React.ReactElement} The message bubble
 */
function MessageBubble({ message, isStreaming }) {
  // ─────────────────────────────────────────────────────────────────────────────
  // MESSAGE STATE ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────────
  const isUser = message.role === 'user';
  // Processing state: has isProcessing flag AND no content yet
  const isProcessing = message.isProcessing && !message.content;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      {/* Message Container - Flex direction changes based on role */}
      <div className={cn(
        "flex items-start gap-3 max-w-[80%]",
        isUser && "flex-row-reverse" // User messages: bubble on left of avatar
      )}>
        {/* ─────────────────────────────────────────────────────────────────────
            AVATAR
            User: Primary color with User icon
            Assistant: Muted color with Bot icon
            ───────────────────────────────────────────────────────────────────── */}
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            MESSAGE BUBBLE
            Different corner rounding based on role for chat bubble effect
            ───────────────────────────────────────────────────────────────────── */}
        <div className={cn(
          "px-4 py-2.5 rounded-2xl",
          // Role-based styling
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-md"  // User: primary, top-right corner
            : "bg-muted text-foreground rounded-tl-md",           // Assistant: muted, top-left corner
          // Error state override
          message.isError && "bg-destructive/10 text-destructive"
        )}>
          {isProcessing ? (
            // ─────────────────────────────────────────────────────────────────────
            // PROCESSING STATE
            // Shows spinner and "Thinking..." text
            // ─────────────────────────────────────────────────────────────────────
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          ) : (
            <>
              {/* ─────────────────────────────────────────────────────────────────
                  MESSAGE CONTENT
                  Preserves whitespace and handles word wrapping
                  ───────────────────────────────────────────────────────────────── */}
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
                {/* Streaming cursor - blinking indicator while AI is typing */}
                {isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-current ml-1 animate-pulse" />
                )}
              </p>

              {/* ─────────────────────────────────────────────────────────────────
                  TIMESTAMP
                  Shown below content when message is complete
                  ───────────────────────────────────────────────────────────────── */}
              {message.createdAt && !isProcessing && (
                <span className={cn(
                  "block text-xs mt-1.5",
                  isUser ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
