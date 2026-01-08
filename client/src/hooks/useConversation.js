import { useState, useCallback } from 'react';
import {
  createConversation as apiCreateConversation,
  getConversation as apiGetConversation,
  listConversations as apiListConversations
} from '../services/conversationService';

export function useConversation() {
  const [conversation, setConversation] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createConversation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const newConversation = await apiCreateConversation();
      setConversation({
        ...newConversation,
        messages: []
      });
      return newConversation;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversation = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await apiGetConversation(id);
      setConversation(loaded);
      return loaded;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversations = useCallback(async (page = 1, limit = 10) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiListConversations(page, limit);
      setConversations(result.conversations);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addMessage = useCallback((message) => {
    setConversation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [...prev.messages, message]
      };
    });
  }, []);

  const updateLastMessage = useCallback((content) => {
    setConversation(prev => {
      if (!prev || prev.messages.length === 0) return prev;
      const messages = [...prev.messages];
      const lastIndex = messages.length - 1;
      messages[lastIndex] = {
        ...messages[lastIndex],
        content: messages[lastIndex].content + content
      };
      return { ...prev, messages };
    });
  }, []);

  const replaceLastMessage = useCallback((newMessage) => {
    setConversation(prev => {
      if (!prev || prev.messages.length === 0) return prev;
      const messages = [...prev.messages];
      messages[messages.length - 1] = newMessage;
      return { ...prev, messages };
    });
  }, []);

  const clearConversation = useCallback(() => {
    setConversation(null);
  }, []);

  return {
    conversation,
    conversations,
    loading,
    error,
    createConversation,
    loadConversation,
    loadConversations,
    addMessage,
    updateLastMessage,
    replaceLastMessage,
    clearConversation,
    setConversation
  };
}
