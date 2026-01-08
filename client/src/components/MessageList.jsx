import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import MessageBubble from './MessageBubble';

function MessageList({ messages, streaming }) {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!messages || messages.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 4,
          color: 'text.secondary'
        }}
      >
        <Typography variant="h6" gutterBottom>
          Welcome to SafeChat
        </Typography>
        <Typography variant="body2" textAlign="center">
          I'm here to help you with customer support questions.
          <br />
          Type a message below to get started.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        py: 2
      }}
    >
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id || index}
          message={message}
          isStreaming={streaming && index === messages.length - 1 && message.role === 'assistant'}
        />
      ))}
      <div ref={bottomRef} />
    </Box>
  );
}

export default MessageList;
