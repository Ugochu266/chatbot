import React, { useState } from 'react';
import { Box, TextField, IconButton, Typography } from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';

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
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        p: 2,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          error={isOverLimit}
          variant="outlined"
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3
            }
          }}
        />
        <IconButton
          type="submit"
          color="primary"
          disabled={!message.trim() || disabled || isOverLimit}
          sx={{
            bgcolor: 'primary.main',
            color: 'white',
            '&:hover': {
              bgcolor: 'primary.dark'
            },
            '&:disabled': {
              bgcolor: 'grey.300',
              color: 'grey.500'
            }
          }}
        >
          <SendIcon />
        </IconButton>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
        <Typography
          variant="caption"
          color={isOverLimit ? 'error' : 'text.secondary'}
        >
          {charCount}/{MAX_LENGTH}
        </Typography>
      </Box>
    </Box>
  );
}

export default ChatInput;
