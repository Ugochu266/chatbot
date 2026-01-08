import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { cn } from '../lib/utils';

const MAX_LENGTH = 2000;

function ChatInput({ onSend, disabled }) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const charCount = message.length;
  const isOverLimit = charCount > MAX_LENGTH;

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-card">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Type your message..."
            rows={1}
            className={cn(
              "w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "max-h-32 overflow-y-auto",
              isOverLimit && "border-destructive focus:ring-destructive"
            )}
            style={{ minHeight: '44px' }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
            }}
          />
        </div>
        <button
          type="submit"
          disabled={!message.trim() || disabled || isOverLimit}
          className={cn(
            "h-11 w-11 rounded-xl flex items-center justify-center transition-colors shrink-0",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
          )}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
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
