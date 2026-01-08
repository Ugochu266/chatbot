import { AppError } from './errorHandler.js';

const MAX_MESSAGE_LENGTH = 2000;

// Validate message content
export function validateMessage(req, res, next) {
  const { content } = req.body;

  if (!content) {
    return next(new AppError('Message content is required', 400, 'VALIDATION_ERROR'));
  }

  if (typeof content !== 'string') {
    return next(new AppError('Message content must be a string', 400, 'VALIDATION_ERROR'));
  }

  const trimmedContent = content.trim();

  if (trimmedContent.length === 0) {
    return next(new AppError('Message cannot be empty', 400, 'VALIDATION_ERROR'));
  }

  if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
    return next(new AppError(
      `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
      400,
      'MESSAGE_TOO_LONG'
    ));
  }

  // Store trimmed content
  req.body.content = trimmedContent;
  next();
}

// Validate conversation ID
export function validateConversationId(req, res, next) {
  const { conversationId } = req.body;
  const id = conversationId || req.params.id;

  if (!id) {
    return next(new AppError('Conversation ID is required', 400, 'VALIDATION_ERROR'));
  }

  // UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return next(new AppError('Invalid conversation ID format', 400, 'VALIDATION_ERROR'));
  }

  next();
}

// Validate pagination params
export function validatePagination(req, res, next) {
  let { page, limit } = req.query;

  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;

  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 50) limit = 50;

  req.pagination = { page, limit };
  next();
}
