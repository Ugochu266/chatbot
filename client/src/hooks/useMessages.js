import { useState, useCallback, useRef } from 'react';
import { sendMessage as apiSendMessage, streamMessage } from '../services/messageService';

export function useMessages(conversationId, onMessageUpdate) {
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const sendMessage = useCallback(async (content) => {
    if (!conversationId) {
      setError('No conversation selected');
      return null;
    }

    setSending(true);
    setError(null);

    try {
      const result = await apiSendMessage(conversationId, content);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSending(false);
    }
  }, [conversationId]);

  const sendStreamingMessage = useCallback((content, callbacks) => {
    if (!conversationId) {
      setError('No conversation selected');
      return;
    }

    setStreaming(true);
    setError(null);

    const { onContent, onDone, onError } = callbacks;

    abortRef.current = streamMessage(conversationId, content, {
      onContent: (chunk) => {
        onContent?.(chunk);
        onMessageUpdate?.('content', chunk);
      },
      onDone: (data) => {
        setStreaming(false);
        onDone?.(data);
        onMessageUpdate?.('done', data);
      },
      onError: (err) => {
        setStreaming(false);
        setError(err.message);
        onError?.(err);
        onMessageUpdate?.('error', err);
      }
    });
  }, [conversationId, onMessageUpdate]);

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
      setStreaming(false);
    }
  }, []);

  return {
    sendMessage,
    sendStreamingMessage,
    cancelStream,
    sending,
    streaming,
    error,
    isLoading: sending || streaming
  };
}
