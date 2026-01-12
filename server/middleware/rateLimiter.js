/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Rate Limiter Middleware Module
 *
 * This module implements rate limiting to protect the SafeChat API from abuse,
 * denial-of-service attacks, and runaway costs. It uses express-rate-limit
 * with session-based tracking.
 *
 * Rate Limiting Strategy:
 * - Limits are per-session (identified by X-Session-Id header)
 * - Falls back to IP address if no session ID provided
 * - Different limits for different endpoint types
 * - Sliding window with automatic reset
 *
 * Configured Limiters:
 * 1. messageRateLimiter: 20 requests/minute - For chat message endpoints
 * 2. conversationRateLimiter: 5 requests/minute - For conversation creation
 *
 * Why Different Limits:
 * - Messages: Higher limit to allow natural conversation flow
 * - Conversations: Lower limit to prevent resource exhaustion
 *
 * Response Headers (standard):
 * - X-RateLimit-Limit: Maximum requests allowed
 * - X-RateLimit-Remaining: Requests remaining in current window
 * - X-RateLimit-Reset: Timestamp when the limit resets
 *
 * When Limit Exceeded:
 * - Returns 429 Too Many Requests
 * - Includes Retry-After header
 * - Returns JSON error with user-friendly message
 *
 * @module middleware/rateLimiter
 */

import rateLimit from 'express-rate-limit';

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE RATE LIMITER
// Applied to chat message endpoints (POST /api/messages)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rate limiter for chat message endpoints.
 *
 * Configuration:
 * - 20 requests per 60 seconds (1 minute window)
 * - Tracked by session ID or IP address
 *
 * This limit is designed to:
 * - Allow natural conversation pace (one message every 3 seconds)
 * - Prevent automated spam/abuse
 * - Protect against runaway API costs (OpenAI calls)
 * - Ensure fair usage across users
 *
 * Apply to: POST /api/messages, GET /api/messages/stream
 */
export const messageRateLimiter = rateLimit({
  // ─────────────────────────────────────────────────────────────────────────────
  // WINDOW CONFIGURATION
  // Time window in milliseconds (60 seconds = 1 minute)
  // After this period, the request count resets
  // ─────────────────────────────────────────────────────────────────────────────
  windowMs: 60 * 1000,

  // ─────────────────────────────────────────────────────────────────────────────
  // REQUEST LIMIT
  // Maximum number of requests allowed per window per key
  // 20 messages/minute = roughly 1 message every 3 seconds
  // ─────────────────────────────────────────────────────────────────────────────
  max: 20,

  // ─────────────────────────────────────────────────────────────────────────────
  // KEY GENERATOR
  // Function that returns a unique identifier for rate limit tracking
  // Uses session ID for authenticated users, IP for anonymous
  // ─────────────────────────────────────────────────────────────────────────────
  keyGenerator: (req) => {
    // Prefer session ID from header for consistency with session handler
    // Fall back to IP address for requests without session
    return req.headers['x-session-id'] || req.ip;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR RESPONSE
  // JSON response returned when rate limit is exceeded
  // User-friendly message encourages patience rather than frustration
  // ─────────────────────────────────────────────────────────────────────────────
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit. Please wait a moment before sending more messages.',
    retryAfter: 60  // Seconds until they can try again
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // HEADER CONFIGURATION
  // standardHeaders: Use RateLimit-* headers (modern standard)
  // legacyHeaders: Don't use X-RateLimit-* headers (deprecated)
  // ─────────────────────────────────────────────────────────────────────────────
  standardHeaders: true,   // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,    // Disable deprecated X-RateLimit-* headers
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION RATE LIMITER
// Applied to conversation creation (POST /api/conversations)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rate limiter for conversation creation endpoint.
 *
 * Configuration:
 * - 5 requests per 60 seconds (1 minute window)
 * - Tracked by session ID or IP address
 *
 * This limit is stricter because:
 * - Conversations are heavier resources than individual messages
 * - Normal users rarely need more than a few conversations
 * - Prevents conversation spam/DoS attacks
 * - Reduces database growth from abuse
 *
 * Apply to: POST /api/conversations
 */
export const conversationRateLimiter = rateLimit({
  // 1 minute window (same as message limiter)
  windowMs: 60 * 1000,

  // Only 5 new conversations per minute
  // This is sufficient for legitimate use while preventing abuse
  max: 5,

  // Same key generation strategy as message limiter
  keyGenerator: (req) => req.headers['x-session-id'] || req.ip,

  // Friendly error message for when limit is hit
  message: {
    error: 'Too many conversations',
    message: 'Please wait before creating another conversation.',
  },
});
