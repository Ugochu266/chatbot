import React, { useEffect, useCallback } from 'react';
import { Box, Alert, Snackbar } from '@mui/material';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { useConversation } from '../hooks/useConversation';
import { useMessages } from '../hooks/useMessages';

function ChatContainer({ conversationId, onConversationCreate }) {
  const {
    conversation,
    loading: conversationLoading,
    error: conversationError,
    createConversation,
    loadConversation,
    addMessage,
    updateLastMessage
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

  // Load or create conversation on mount
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

  const handleSend = async (content) => {
    // Add user message immediately
    const userMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    addMessage(userMessage);

    // Add placeholder for assistant response
    const assistantPlaceholder = {
      id: `temp-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString()
    };
    addMessage(assistantPlaceholder);

    try {
      const result = await sendMessage(content);

      // Update with actual response
      if (result) {
        // The response already contains the full message
        // We could reload the conversation or just keep the streamed content
      }
    } catch (error) {
      // Error is handled by the hook
    }
  };

  const error = conversationError || messageError;
  const isLoading = conversationLoading || messageLoading;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.default'
      }}
    >
      <MessageList
        messages={conversation?.messages || []}
        streaming={streaming}
      />
      <ChatInput
        onSend={handleSend}
        disabled={isLoading || !conversation}
      />
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled">
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default ChatContainer;
