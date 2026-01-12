/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Error Handler Middleware Module
 *
 * This module provides centralized error handling and logging for the SafeChat
 * application. It includes:
 *
 * 1. Winston Logger Configuration - Structured JSON logging with environment-aware levels
 * 2. AppError Class - Custom error type for operational errors with HTTP codes
 * 3. Error Handler Middleware - Catches and formats all errors for API responses
 * 4. Not Found Handler - Catches requests to undefined routes
 *
 * Error Philosophy:
 * - Operational errors (expected): Show user-friendly messages, log for monitoring
 * - Programming errors (bugs): Show generic message, full details in logs
 * - All errors are logged with context (path, method, session) for debugging
 *
 * Usage:
 * 1. Import AppError to throw custom errors in route handlers
 * 2. Import logger for manual logging throughout the application
 * 3. Register errorHandler as the LAST middleware in Express
 * 4. Register notFoundHandler before errorHandler
 *
 * @module middleware/errorHandler
 */

import winston from 'winston';

// ═══════════════════════════════════════════════════════════════════════════════
// WINSTON LOGGER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Application-wide logger instance using Winston.
 *
 * Configuration:
 * - Production: Only 'error' level logs (performance and noise reduction)
 * - Development: 'debug' level for full visibility
 *
 * Output Format:
 * - JSON format with timestamps for machine parsing
 * - Console output with colors for human readability
 *
 * The logger is exported for use throughout the application. Use it like:
 * - logger.error({ message: 'Critical failure', error: err.message })
 * - logger.warn('Unusual condition detected')
 * - logger.info('Operation completed successfully')
 * - logger.debug('Detailed debugging info')
 */
const logger = winston.createLogger({
  // Log level based on environment
  // Production: Only errors to reduce noise and improve performance
  // Development: Full debug output for troubleshooting
  level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',

  // JSON format with timestamps for structured logging
  // This format is ideal for log aggregation services (DataDog, Splunk, etc.)
  format: winston.format.combine(
    winston.format.timestamp(),  // Add ISO timestamp to each log
    winston.format.json()         // Output as JSON for parsing
  ),

  // Transport configuration - where logs are sent
  transports: [
    // Console transport with colorized output for terminal readability
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),  // Color-code by log level
        winston.format.simple()      // Simple key=value format for console
      )
    })
    // Production Enhancement: Add file or cloud transports here
    // new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
});

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Custom application error class for operational errors.
 *
 * AppError extends the native Error class with additional properties needed
 * for HTTP error responses. Use this class for all expected/operational errors
 * that should return specific HTTP status codes.
 *
 * Properties:
 * - message: Human-readable error description
 * - statusCode: HTTP status code (400, 401, 403, 404, 500, etc.)
 * - code: Machine-readable error code for client handling
 * - isOperational: Flag indicating this is an expected error (not a bug)
 *
 * The isOperational flag is crucial for error handling:
 * - true: Safe to show message to user (validation errors, not found, etc.)
 * - false/undefined: Programming error, show generic message to user
 *
 * @class AppError
 * @extends Error
 *
 * @example
 * // Validation error
 * throw new AppError('Email is required', 400, 'VALIDATION_ERROR');
 *
 * @example
 * // Not found error
 * throw new AppError('Conversation not found', 404, 'NOT_FOUND');
 *
 * @example
 * // Authorization error
 * throw new AppError('Access denied', 403, 'FORBIDDEN');
 */
export class AppError extends Error {
  /**
   * Create a new AppError instance.
   *
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code to return
   * @param {string} [code='INTERNAL_ERROR'] - Machine-readable error code
   */
  constructor(message, statusCode, code = 'INTERNAL_ERROR') {
    // Call parent Error constructor with message
    super(message);

    // HTTP status code for the response
    this.statusCode = statusCode;

    // Machine-readable code for client-side error handling
    // Common codes: VALIDATION_ERROR, NOT_FOUND, FORBIDDEN, UNAUTHORIZED
    this.code = code;

    // Mark as operational error (expected, not a bug)
    // This determines whether the actual message is safe to show users
    this.isOperational = true;

    // Capture stack trace, excluding constructor call from it
    // This provides cleaner stack traces pointing to where the error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLER MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Express error handler middleware.
 *
 * This middleware catches all errors thrown or passed to next() in the
 * application. It must be registered AFTER all routes to catch their errors.
 *
 * Responsibilities:
 * 1. Extract status code and error code from the error
 * 2. Log the error with full context for debugging
 * 3. Return appropriate JSON response to the client
 *
 * Security Considerations:
 * - Never expose stack traces in production
 * - Only show operational error messages to users
 * - Generic message for unexpected errors (programming bugs)
 *
 * @param {Error} err - The error object (AppError or native Error)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function (required for Express error handlers)
 */
export function errorHandler(err, req, res, next) {
  // ─────────────────────────────────────────────────────────────────────────────
  // EXTRACT ERROR DETAILS
  // Use defaults if not an AppError (for unexpected/programming errors)
  // ─────────────────────────────────────────────────────────────────────────────
  const statusCode = err.statusCode || 500;    // Default to 500 Internal Server Error
  const code = err.code || 'INTERNAL_ERROR';   // Default error code

  // ─────────────────────────────────────────────────────────────────────────────
  // LOG ERROR WITH CONTEXT
  // Include all relevant information for debugging and monitoring
  // This data helps trace issues back to specific requests
  // ─────────────────────────────────────────────────────────────────────────────
  logger.error({
    message: err.message,
    code,
    statusCode,
    stack: err.stack,          // Full stack trace for debugging
    path: req.path,            // Which endpoint was called
    method: req.method,        // HTTP method (GET, POST, etc.)
    sessionId: req.sessionId   // Session for tracking user journey
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SEND ERROR RESPONSE
  // Response format is consistent for all errors
  // ─────────────────────────────────────────────────────────────────────────────
  res.status(statusCode).json({
    error: code,
    // Only show actual message for operational errors
    // For programming errors (bugs), show generic message to avoid info leakage
    message: err.isOperational ? err.message : 'An unexpected error occurred',
    // Include stack trace only in development for debugging
    // NEVER expose stack traces in production (security risk)
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOT FOUND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle requests to undefined routes.
 *
 * This middleware catches all requests that don't match any defined route.
 * It should be registered AFTER all routes but BEFORE the error handler.
 *
 * Returns a 404 response with details about the attempted route.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`
  });
}

// Export logger for use throughout the application
export { logger };
