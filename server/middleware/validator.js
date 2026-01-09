/**
 * Request Validator Middleware Module
 *
 * This module provides validation middleware for incoming API requests.
 * All validators follow Express middleware conventions and pass errors
 * to the error handler via next(error).
 *
 * Available Validators:
 * 1. validateMessage - Validates chat message content
 * 2. validateConversationId - Validates UUID format for conversation IDs
 * 3. validatePagination - Normalizes and validates pagination parameters
 *
 * Validation Philosophy:
 * - Fail fast: Reject invalid input before processing
 * - Clear messages: Tell users exactly what's wrong
 * - Sanitize input: Trim whitespace, normalize values
 * - Consistent format: Same error structure for all validation failures
 *
 * Security Benefits:
 * - Prevents injection attacks by validating UUID formats
 * - Limits message size to prevent denial-of-service
 * - Normalizes input to prevent edge case exploits
 *
 * @module middleware/validator
 */

import { AppError } from './errorHandler.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum allowed message length in characters.
 *
 * This limit:
 * - Prevents abuse through extremely long messages
 * - Controls OpenAI API costs (tokens are roughly proportional to characters)
 * - Ensures reasonable response times
 * - Protects database storage
 *
 * 2000 characters is approximately 400-500 words, sufficient for
 * most customer support questions while limiting abuse potential.
 */
const MAX_MESSAGE_LENGTH = 2000;

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate chat message content from request body.
 *
 * Validates that the message:
 * - Exists in the request body
 * - Is a string type
 * - Is not empty after trimming whitespace
 * - Does not exceed maximum length
 *
 * On success, replaces req.body.content with trimmed version.
 * On failure, passes AppError to error handler.
 *
 * @param {Object} req - Express request object (expects req.body.content)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 *
 * @example
 * // Route definition
 * router.post('/messages', validateMessage, async (req, res) => {
 *   // req.body.content is guaranteed to be valid and trimmed
 *   const message = req.body.content;
 * });
 */
export function validateMessage(req, res, next) {
  const { content } = req.body;

  // ─────────────────────────────────────────────────────────────────────────────
  // PRESENCE CHECK
  // Content field must exist in request body
  // ─────────────────────────────────────────────────────────────────────────────
  if (!content) {
    return next(new AppError('Message content is required', 400, 'VALIDATION_ERROR'));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TYPE CHECK
  // Content must be a string (not number, object, array, etc.)
  // ─────────────────────────────────────────────────────────────────────────────
  if (typeof content !== 'string') {
    return next(new AppError('Message content must be a string', 400, 'VALIDATION_ERROR'));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SANITIZATION
  // Trim whitespace from both ends to normalize input
  // ─────────────────────────────────────────────────────────────────────────────
  const trimmedContent = content.trim();

  // ─────────────────────────────────────────────────────────────────────────────
  // EMPTY CHECK
  // After trimming, content must still have characters
  // Prevents messages that are just whitespace
  // ─────────────────────────────────────────────────────────────────────────────
  if (trimmedContent.length === 0) {
    return next(new AppError('Message cannot be empty', 400, 'VALIDATION_ERROR'));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LENGTH CHECK
  // Enforce maximum length to prevent abuse
  // Uses specific error code for client to handle differently if needed
  // ─────────────────────────────────────────────────────────────────────────────
  if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
    return next(new AppError(
      `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
      400,
      'MESSAGE_TOO_LONG'  // Specific code for length errors
    ));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STORE SANITIZED CONTENT
  // Replace original content with trimmed version for downstream handlers
  // ─────────────────────────────────────────────────────────────────────────────
  req.body.content = trimmedContent;
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION ID VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate conversation ID format.
 *
 * Checks that the conversation ID is a valid UUID v4 format.
 * The ID can come from either:
 * - req.body.conversationId (for POST requests)
 * - req.params.id (for GET/PUT/DELETE requests)
 *
 * UUID Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * - 8 hex digits - 4 hex digits - 4 hex digits - 4 hex digits - 12 hex digits
 * - Total: 32 hex characters + 4 hyphens = 36 characters
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 *
 * @example
 * // URL parameter validation
 * router.get('/conversations/:id', validateConversationId, getConversation);
 *
 * @example
 * // Body validation
 * router.post('/messages', validateConversationId, sendMessage);
 */
export function validateConversationId(req, res, next) {
  // Check both body and params for the conversation ID
  // Body is used for POST requests, params for URL parameters
  const { conversationId } = req.body;
  const id = conversationId || req.params.id;

  // ─────────────────────────────────────────────────────────────────────────────
  // PRESENCE CHECK
  // Conversation ID must be provided somewhere
  // ─────────────────────────────────────────────────────────────────────────────
  if (!id) {
    return next(new AppError('Conversation ID is required', 400, 'VALIDATION_ERROR'));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UUID FORMAT VALIDATION
  // Strict regex to ensure proper UUID format
  // Case-insensitive to accept both uppercase and lowercase hex
  // ─────────────────────────────────────────────────────────────────────────────
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(id)) {
    return next(new AppError('Invalid conversation ID format', 400, 'VALIDATION_ERROR'));
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGINATION VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate and normalize pagination query parameters.
 *
 * This middleware:
 * - Parses page and limit from query string
 * - Applies default values if not provided
 * - Enforces minimum and maximum bounds
 * - Attaches normalized values to req.pagination
 *
 * Defaults:
 * - page: 1 (first page)
 * - limit: 10 (10 items per page)
 *
 * Bounds:
 * - page: minimum 1 (no negative or zero pages)
 * - limit: minimum 1, maximum 50 (prevents huge responses)
 *
 * @param {Object} req - Express request object (checks req.query.page, req.query.limit)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 *
 * @example
 * // Route with pagination
 * router.get('/conversations', validatePagination, async (req, res) => {
 *   const { page, limit } = req.pagination;
 *   // page and limit are guaranteed to be valid numbers
 * });
 *
 * @example
 * // Query string examples:
 * // ?page=2&limit=20  → { page: 2, limit: 20 }
 * // ?page=-1&limit=100 → { page: 1, limit: 50 } (normalized)
 * // (no params)       → { page: 1, limit: 10 } (defaults)
 */
export function validatePagination(req, res, next) {
  // Extract pagination params from query string
  let { page, limit } = req.query;

  // ─────────────────────────────────────────────────────────────────────────────
  // PARSE AND DEFAULT
  // Convert strings to integers, use defaults if not provided or NaN
  // ─────────────────────────────────────────────────────────────────────────────
  page = parseInt(page) || 1;   // Default to page 1
  limit = parseInt(limit) || 10; // Default to 10 items per page

  // ─────────────────────────────────────────────────────────────────────────────
  // BOUND ENFORCEMENT
  // Prevent invalid values while being permissive with input
  // ─────────────────────────────────────────────────────────────────────────────

  // Page must be at least 1 (no negative or zero pages)
  if (page < 1) page = 1;

  // Limit must be at least 1 item
  if (limit < 1) limit = 1;

  // Limit cannot exceed 50 to prevent huge responses
  // This protects against accidental or malicious large queries
  if (limit > 50) limit = 50;

  // ─────────────────────────────────────────────────────────────────────────────
  // ATTACH TO REQUEST
  // Store validated pagination in a dedicated object for clean access
  // ─────────────────────────────────────────────────────────────────────────────
  req.pagination = { page, limit };
  next();
}
