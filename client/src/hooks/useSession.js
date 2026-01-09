/**
 * Session Management Hook
 *
 * This hook manages user session state in SafeChat. It provides a persistent
 * session ID that identifies the user across browser sessions.
 *
 * Session Storage:
 * - Uses localStorage for persistence across browser sessions
 * - Session ID is a UUID (crypto.randomUUID)
 * - Same ID used by api.js for X-Session-Id header
 *
 * Usage Pattern:
 * - On first visit: Generates new UUID, stores in localStorage
 * - On subsequent visits: Retrieves existing UUID
 * - resetSession(): Forces new session (loses conversation history)
 *
 * Note: This hook mirrors the session logic in api.js but provides
 * React state management for components that need to react to
 * session changes.
 *
 * @module hooks/useSession
 */

import { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * LocalStorage key for session ID.
 * Must match the key used in api.js to ensure consistency.
 */
const SESSION_KEY = 'safechat_session_id';

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for managing user session state.
 *
 * Provides the current session ID and a function to reset it.
 * The session ID is lazily initialized from localStorage on first render.
 *
 * @returns {Object} Session state and actions:
 *   - sessionId: Current session UUID (may be null during initialization)
 *   - resetSession: Function to generate a new session (starts fresh)
 *
 * @example
 * function App() {
 *   const { sessionId, resetSession } = useSession();
 *
 *   return (
 *     <div>
 *       <p>Session: {sessionId}</p>
 *       <button onClick={resetSession}>Start Fresh</button>
 *     </div>
 *   );
 * }
 */
export function useSession() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE INITIALIZATION
  // Lazy initializer reads from localStorage on first render
  // ─────────────────────────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem(SESSION_KEY);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SESSION CREATION EFFECT
  // Creates new session if none exists (first-time visitors)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      // Generate cryptographically secure UUID
      const newSessionId = crypto.randomUUID();

      // Persist to localStorage for future visits
      localStorage.setItem(SESSION_KEY, newSessionId);

      // Update React state
      setSessionId(newSessionId);
    }
  }, [sessionId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SESSION RESET FUNCTION
  // Generates new session ID, effectively starting fresh
  // User will lose access to previous conversation history
  // ─────────────────────────────────────────────────────────────────────────────
  const resetSession = () => {
    const newSessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, newSessionId);
    setSessionId(newSessionId);
  };

  return { sessionId, resetSession };
}
