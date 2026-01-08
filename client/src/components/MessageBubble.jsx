import React from 'react';
import { User, Bot, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

function MessageBubble({ message, isStreaming }) {
  const isUser = message.role === 'user';
  const isProcessing = message.isProcessing && !message.content;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "flex items-start gap-3 max-w-[80%]",
        isUser && "flex-row-reverse"
      )}>
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
        <div className={cn(
          "px-4 py-2.5 rounded-2xl",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-md"
            : "bg-muted text-foreground rounded-tl-md",
          message.isError && "bg-destructive/10 text-destructive"
        )}>
          {isProcessing ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          ) : (
            <>
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
                {isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-current ml-1 animate-pulse" />
                )}
              </p>
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
