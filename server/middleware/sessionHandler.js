/**
 * Session Handler Middleware Module
 *
 * This module implements stateless session management for the SafeChat application.
 * Instead of server-side session storage, it uses client-provided session IDs
 * passed via HTTP headers.
 *
 * How It Works:
 * 1. Client sends X-Session-Id header with each request
 * 2. Middleware validates the session ID format (must be valid UUID)
 * 3. If missing or invalid, generates a new UUID and returns it in response header
 * 4. Session ID is attached to req.sessionId for use in route handlers
 *
 * Benefits of This Approach:
 * - Stateless: No server-side session storage needed
 * - Scalable: Works across multiple server instances
 * - Simple: No Redis/database session store required
 * - Client-controlled: Session persists as long as client keeps the ID
 *
 * Security Considerations:
 * - Session IDs are UUIDs (cryptographically random, unguessable)
 * - Sessions are scoped to conversations (users can only access own data)
 * - No sensitive data stored in session ID itself
 *
 * Integration Points:
 * - Conversation creation uses sessionId for ownership
 * - Message endpoints verify conversation belongs to session
 * - Admin dashboard may use different authentication
 *
 * @module middleware/sessionHandler
 */

import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION HANDLER MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Express middleware for session ID management.
 *
 * This middleware ensures every request has a valid session ID. The session ID
 * is used to:
 * - Associate conversations with a specific user/session
 * - Enforce access control (users can only see their own conversations)
 * - Track user activity across multiple requests
 * - Rate limiting per session
 *
 * Session ID Source Priority:
 * 1. X-Session-Id header from client (if valid UUID)
 * 2. Generate new UUID if missing or invalid
 *
 * The session ID is:
 * - Attached to req.sessionId for downstream handlers
 * - Returned in X-Session-Id response header (for new sessions)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 *
 * @example
 * // Client request with existing session:
 * // Headers: { "X-Session-Id": "123e4567-e89b-12d3-a456-426614174000" }
 * // req.sessionId = "123e4567-e89b-12d3-a456-426614174000"
 *
 * @example
 * // Client request without session (new user):
 * // Headers: {}
 * // Response Headers: { "X-Session-Id": "<new-uuid>" }
 * // req.sessionId = "<new-uuid>"
 */
export function sessionHandler(req, res, next) {
  // ─────────────────────────────────────────────────────────────────────────────
  // EXTRACT SESSION ID FROM REQUEST
  // The client should pass their session ID in the X-Session-Id header
  // ─────────────────────────────────────────────────────────────────────────────
  let sessionId = req.headers['x-session-id'];

  // ─────────────────────────────────────────────────────────────────────────────
  // UUID FORMAT VALIDATION
  // Session IDs must be valid UUIDs to prevent injection attacks and ensure
  // uniqueness. The regex matches standard UUID v4 format:
  // xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (8-4-4-4-12 hex digits)
  // ─────────────────────────────────────────────────────────────────────────────
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ─────────────────────────────────────────────────────────────────────────────
  // GENERATE NEW SESSION IF NEEDED
  // Create a new session for:
  // - First-time visitors (no session ID provided)
  // - Invalid session IDs (failed format validation)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!sessionId || !uuidRegex.test(sessionId)) {
    // Generate cryptographically random UUID v4
    sessionId = uuidv4();

    // Return the new session ID to the client in response headers
    // Client should store this and send with future requests
    res.setHeader('X-Session-Id', sessionId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ATTACH SESSION ID TO REQUEST
  // Make sessionId available to all downstream route handlers
  // ─────────────────────────────────────────────────────────────────────────────
  req.sessionId = sessionId;

  next();
}
