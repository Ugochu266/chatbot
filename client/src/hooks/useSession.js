import { useState, useEffect } from 'react';

const SESSION_KEY = 'safechat_session_id';

export function useSession() {
  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem(SESSION_KEY);
  });

  useEffect(() => {
    if (!sessionId) {
      const newSessionId = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, newSessionId);
      setSessionId(newSessionId);
    }
  }, [sessionId]);

  const resetSession = () => {
    const newSessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, newSessionId);
    setSessionId(newSessionId);
  };

  return { sessionId, resetSession };
}
