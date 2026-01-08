import { api, API_URL } from './api';

// Send a message and get response
export async function sendMessage(conversationId, content) {
  const response = await api.post('/api/messages', {
    conversationId,
    content
  });
  return response.data;
}

// Stream a message response using SSE
export function streamMessage(conversationId, content, callbacks) {
  const { onContent, onDone, onError } = callbacks;

  const url = new URL(`${API_URL}/api/messages/stream/${conversationId}`);
  url.searchParams.set('message', content);

  const eventSource = new EventSource(url.toString());

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'content':
          onContent?.(data.content);
          break;
        case 'done':
          onDone?.(data);
          eventSource.close();
          break;
        case 'error':
          onError?.(new Error(data.message));
          eventSource.close();
          break;
        default:
          break;
      }
    } catch (error) {
      onError?.(error);
    }
  };

  eventSource.onerror = (error) => {
    onError?.(new Error('Connection lost'));
    eventSource.close();
  };

  // Return cleanup function
  return () => {
    eventSource.close();
  };
}
