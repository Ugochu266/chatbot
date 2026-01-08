import { api } from './api';

// Create a new conversation
export async function createConversation() {
  const response = await api.post('/api/conversations');
  return response.data.conversation;
}

// Get a conversation with its messages
export async function getConversation(id) {
  const response = await api.get(`/api/conversations/${id}`);
  return response.data.conversation;
}

// List all conversations for current session
export async function listConversations(page = 1, limit = 10) {
  const response = await api.get('/api/conversations', {
    params: { page, limit }
  });
  return {
    conversations: response.data.conversations,
    pagination: response.data.pagination
  };
}
