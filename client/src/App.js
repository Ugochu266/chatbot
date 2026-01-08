import React, { useState, useCallback } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, GlobalStyles } from '@mui/material';
import Header from './components/Header';
import ChatContainer from './components/ChatContainer';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0'
    },
    secondary: {
      main: '#9c27b0'
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff'
    }
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif'
  },
  shape: {
    borderRadius: 8
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none'
        }
      }
    }
  }
});

const globalStyles = (
  <GlobalStyles
    styles={{
      '@keyframes blink': {
        '0%, 50%': { opacity: 1 },
        '51%, 100%': { opacity: 0 }
      },
      '*::-webkit-scrollbar': {
        width: '8px'
      },
      '*::-webkit-scrollbar-track': {
        background: '#f1f1f1'
      },
      '*::-webkit-scrollbar-thumb': {
        background: '#c1c1c1',
        borderRadius: '4px'
      },
      '*::-webkit-scrollbar-thumb:hover': {
        background: '#a1a1a1'
      }
    }}
  />
);

function App() {
  const [conversationId, setConversationId] = useState(null);
  const [key, setKey] = useState(0);

  const handleNewChat = useCallback(() => {
    setConversationId(null);
    setKey(prev => prev + 1); // Force remount of ChatContainer
  }, []);

  const handleConversationCreate = useCallback((id) => {
    setConversationId(id);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {globalStyles}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden'
        }}
      >
        <Header onNewChat={handleNewChat} />
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <ChatContainer
            key={key}
            conversationId={conversationId}
            onConversationCreate={handleConversationCreate}
          />
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
