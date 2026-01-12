/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Chat Input Component
 *
 * This component provides the message input interface for SafeChat.
 * It includes a textarea for message composition with character limit
 * enforcement and keyboard shortcuts.
 *
 * Features:
 * - Auto-expanding textarea (grows with content)
 * - Character limit with visual counter
 * - Enter to send, Shift+Enter for newline
 * - Disabled state during processing
 * - Visual feedback for over-limit
 *
 * Keyboard Shortcuts:
 * - Enter: Submit message
 * - Shift+Enter: New line (no submit)
 *
 * @module components/ChatInput
 */

import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { cn } from '../lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum message length in characters.
 * Should match server-side validation in validator.js
 */
const MAX_LENGTH = 2000;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Message input component with auto-expanding textarea.
 *
 * @param {Object} props - Component props
 * @param {Function} props.onSend - Callback when message is submitted
 *   Receives (messageText) - the trimmed message content
 * @param {boolean} props.disabled - Whether input is disabled
 *   Typically true during message processing
 * @returns {React.ReactElement} The chat input form
 */
function ChatInput({ onSend, disabled }) {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [message, setMessage] = useState('');

  // ─────────────────────────────────────────────────────────────────────────────
  // FORM SUBMISSION
  // Called on form submit or Enter key press
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();

    // Only submit if message has content and component is enabled
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage(''); // Clear input after send
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // KEYBOARD HANDLER
  // Enter submits, Shift+Enter allows newline
  // ─────────────────────────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent newline
      handleSubmit(e);
    }
    // Shift+Enter falls through to default behavior (newline)
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CHARACTER LIMIT TRACKING
  // ─────────────────────────────────────────────────────────────────────────────
  const charCount = message.length;
  const isOverLimit = charCount > MAX_LENGTH;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-card">
      <div className="flex items-end gap-2">
        {/* Textarea Container */}
        <div className="flex-1 relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Type your message..."
            rows={1}
            className={cn(
              // Base styles
              "w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm",
              // Focus and placeholder styles
              "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
              // Disabled state
              "disabled:cursor-not-allowed disabled:opacity-50",
              // Height constraints
              "max-h-32 overflow-y-auto",
              // Error state when over character limit
              isOverLimit && "border-destructive focus:ring-destructive"
            )}
            style={{ minHeight: '44px' }}
            // ───────────────────────────────────────────────────────────────────
            // AUTO-EXPAND HANDLER
            // Textarea grows with content up to max height
            // ───────────────────────────────────────────────────────────────────
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
            }}
          />
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!message.trim() || disabled || isOverLimit}
          className={cn(
            // Base styles
            "h-11 w-11 rounded-xl flex items-center justify-center transition-colors shrink-0",
            // Primary button styling
            "bg-primary text-primary-foreground hover:bg-primary/90",
            // Disabled state
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
          )}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {/* Character Counter */}
      <div className="flex justify-end mt-1.5">
        <span className={cn(
          "text-xs",
          isOverLimit ? "text-destructive" : "text-muted-foreground"
        )}>
          {charCount}/{MAX_LENGTH}
        </span>
      </div>
    </form>
  );
}

export default ChatInput;
