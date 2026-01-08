import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box } from '@mui/material';
import { Chat as ChatIcon, Add as AddIcon } from '@mui/icons-material';

function Header({ onNewChat }) {
  return (
    <AppBar position="static" elevation={1}>
      <Toolbar>
        <ChatIcon sx={{ mr: 2 }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          SafeChat
        </Typography>
        <Box>
          <IconButton
            color="inherit"
            onClick={onNewChat}
            title="New Conversation"
          >
            <AddIcon />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Header;
