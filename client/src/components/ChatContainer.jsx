import React, { useEffect, useCallback, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { useConversation } from '../hooks/useConversation';
import { useMessages } from '../hooks/useMessages';

function ChatContainer({ conversationId, onConversationCreate }) {
  const [showError, setShowError] = useState(false);
  const [processing, setProcessing] = useState(false);

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

  const handleMessageUpdate = useCallback((type, data) => {
    if (type === 'content') {
      updateLastMessage(data);
    }
  }, [updateLastMessage]);

  const {
    sendMessage,
    isLoading: messageLoading,
    error: messageError,
    streaming
  } = useMessages(conversation?.id, handleMessageUpdate);

  useEffect(() => {
    const initConversation = async () => {
      if (conversationId) {
        await loadConversation(conversationId);
      } else {
        const newConv = await createConversation();
        onConversationCreate?.(newConv.id);
      }
    };
    initConversation();
  }, [conversationId, loadConversation, createConversation, onConversationCreate]);

  const error = conversationError || messageError;

  useEffect(() => {
    if (error) {
      setShowError(true);
      const timer = setTimeout(() => setShowError(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSend = async (content) => {
    // Add user message immediately
    const userMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    addMessage(userMessage);

    // Add placeholder for assistant response (shows processing indicator)
    const assistantPlaceholder = {
      id: `temp-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isProcessing: true
    };
    addMessage(assistantPlaceholder);
    setProcessing(true);

    try {
      const result = await sendMessage(content);

      // Update with actual response from API
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
      // Replace placeholder with error message
      replaceLastMessage({
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        createdAt: new Date().toISOString(),
        isProcessing: false,
        isError: true
      });
    } finally {
      setProcessing(false);
    }
  };

  const isLoading = conversationLoading || messageLoading;

  return (
    <div className="flex flex-col flex-1 bg-white overflow-hidden relative">
      <MessageList
        messages={conversation?.messages || []}
        streaming={streaming}
        processing={processing}
      />
      <ChatInput
        onSend={handleSend}
        disabled={isLoading || !conversation || processing}
      />

      {/* Error Toast */}
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
