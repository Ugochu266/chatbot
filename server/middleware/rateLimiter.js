import rateLimit from 'express-rate-limit';

// Rate limiter: 20 requests per minute per session
export const messageRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per window
  keyGenerator: (req) => {
    // Use session ID from header or IP as fallback
    return req.headers['x-session-id'] || req.ip;
  },
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit. Please wait a moment before sending more messages.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for conversation creation
export const conversationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // 5 new conversations per minute
  keyGenerator: (req) => req.headers['x-session-id'] || req.ip,
  message: {
    error: 'Too many conversations',
    message: 'Please wait before creating another conversation.',
  },
});
