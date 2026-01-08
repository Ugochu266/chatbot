import { v4 as uuidv4 } from 'uuid';

// Session handler middleware
// Ensures every request has a session ID
export function sessionHandler(req, res, next) {
  let sessionId = req.headers['x-session-id'];

  // Validate session ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!sessionId || !uuidRegex.test(sessionId)) {
    // Generate new session ID if missing or invalid
    sessionId = uuidv4();
    res.setHeader('X-Session-Id', sessionId);
  }

  req.sessionId = sessionId;
  next();
}
