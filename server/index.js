/**
 * SafeChat API Server
 *
 * This is the main entry point for the SafeChat backend application.
 * It configures and starts an Express.js server with all required middleware,
 * routes, and error handling.
 *
 * Application Architecture:
 * - Express.js server with REST API endpoints
 * - PostgreSQL database (Neon serverless)
 * - OpenAI integration for AI responses and content moderation
 * - Session-based user tracking (stateless via headers)
 * - Multi-layer safety pipeline for content filtering
 *
 * API Base URL: /api
 *
 * Route Groups:
 * - /api/conversations - Conversation CRUD operations
 * - /api/messages - Chat message send/receive
 * - /api/admin - Admin dashboard (escalations, logs, stats)
 * - /api/admin/rules - Safety rules management
 * - /api/admin/settings - Configuration settings
 * - /api/health - Health check endpoint
 *
 * Middleware Stack (in order):
 * 1. Helmet - Security headers
 * 2. CORS - Cross-origin request handling
 * 3. Body Parser - JSON request parsing
 * 4. Session Handler - User session management
 * 5. Route Handlers - API endpoints
 * 6. Not Found Handler - 404 responses
 * 7. Error Handler - Centralized error handling
 *
 * Environment Variables Required:
 * - PORT: Server port (default: 3001)
 * - DATABASE_URL: PostgreSQL connection string
 * - OPENAI_API_KEY: OpenAI API key
 * - CORS_ORIGIN: Allowed origin for CORS (default: http://localhost:3000)
 * - NODE_ENV: Environment (development/production)
 *
 * @module server/index
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// Middleware
import { sessionHandler } from './middleware/sessionHandler.js';
import { errorHandler, notFoundHandler, logger } from './middleware/errorHandler.js';

// Route modules
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import adminRoutes from './routes/admin.js';
import rulesRoutes from './routes/rules.js';
import settingsRoutes from './routes/settings.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load environment variables from .env file.
 * In production, these should be set by the hosting platform.
 */
dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESS APPLICATION SETUP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Express application instance.
 * This is the core application that handles all HTTP requests.
 */
const app = express();

/**
 * Server port configuration.
 * Uses PORT environment variable or defaults to 3001.
 * Port 3001 is chosen to avoid conflict with typical frontend dev servers (3000).
 */
const PORT = process.env.PORT || 3001;

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helmet security middleware.
 *
 * Helmet sets various HTTP headers to protect against common vulnerabilities:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - X-XSS-Protection: 1; mode=block
 * - And many more...
 *
 * Disabled options:
 * - crossOriginEmbedderPolicy: false - Allows loading resources from other origins
 * - contentSecurityPolicy: false - Disabled for SSE (Server-Sent Events) compatibility
 *
 * Note: Consider enabling CSP in production with appropriate directives.
 */
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false  // Disabled for SSE streaming compatibility
}));

// ═══════════════════════════════════════════════════════════════════════════════
// CORS CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CORS (Cross-Origin Resource Sharing) configuration.
 *
 * This enables the frontend application to make requests to this API
 * from a different origin (port/domain).
 *
 * Configuration:
 * - origin: Allowed origin URL (from CORS_ORIGIN env var)
 * - credentials: true - Allow cookies and auth headers
 * - exposedHeaders: X-Session-Id - Expose session header to client
 *
 * Security Note:
 * In production, always set CORS_ORIGIN to your specific frontend domain.
 * Never use '*' with credentials enabled.
 */
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  exposedHeaders: ['X-Session-Id']  // Allow client to read session header
}));

// ═══════════════════════════════════════════════════════════════════════════════
// BODY PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * JSON body parser middleware.
 *
 * Parses incoming JSON request bodies and makes them available
 * as req.body in route handlers.
 *
 * Security Configuration:
 * - Default limit: '10kb' - Prevents large payload attacks
 *   This is sufficient for chat messages while blocking abuse attempts.
 * - Bulk import routes use a higher limit (10MB) for CSV/JSON file uploads
 */

// Higher limit for bulk import endpoints (spare parts data can be large)
app.use('/api/admin/spare-parts/bulk-import', express.json({ limit: '10mb' }));

// Default limit for all other routes
app.use(express.json({ limit: '10kb' }));

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Session handler middleware.
 *
 * Ensures every request has a valid session ID:
 * - Validates X-Session-Id header
 * - Generates new UUID if missing or invalid
 * - Attaches sessionId to req object
 *
 * This middleware runs on ALL routes and must be before route handlers.
 */
app.use(sessionHandler);

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring and load balancers.
 * This endpoint:
 * - Does NOT require authentication
 * - Returns basic server status
 * - Used by deployment platforms to verify service is running
 *
 * Response:
 * - status: 'ok' if server is healthy
 * - timestamp: Current server time (ISO 8601)
 * - version: Application version
 *
 * Usage:
 * - Kubernetes liveness/readiness probes
 * - Load balancer health checks
 * - Uptime monitoring services
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Conversation routes (/api/conversations)
 * - POST / - Create new conversation
 * - GET / - List conversations for session
 * - GET /:id - Get conversation with messages
 */
app.use('/api/conversations', conversationRoutes);

/**
 * Message routes (/api/messages)
 * - POST / - Send message and get AI response
 * - GET /stream/:conversationId - SSE streaming response
 */
app.use('/api/messages', messageRoutes);

/**
 * Admin routes (/api/admin)
 * - GET /escalations - Get escalated conversations
 * - GET /moderation-logs - Get flagged content
 * - GET /stats - Dashboard statistics
 * - Knowledge base CRUD operations
 */
app.use('/api/admin', adminRoutes);

/**
 * Safety rules routes (/api/admin/rules)
 * - CRUD operations for safety rules
 * - Bulk import/export
 * - Rule testing
 */
app.use('/api/admin/rules', rulesRoutes);

/**
 * Settings routes (/api/admin/settings)
 * - Moderation settings (thresholds, actions)
 * - Escalation settings (keywords, templates)
 * - System settings (feature flags)
 */
app.use('/api/admin/settings', settingsRoutes);

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 404 Not Found handler.
 *
 * Catches all requests that don't match any defined route.
 * Must be registered AFTER all route handlers.
 */
app.use(notFoundHandler);

/**
 * Global error handler.
 *
 * Catches all errors thrown or passed to next(error) in the application.
 * Must be registered LAST (after all other middleware and routes).
 *
 * Responsibilities:
 * - Log errors with context
 * - Format error responses
 * - Hide sensitive info in production
 */
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Start the HTTP server.
 *
 * Listens on the configured PORT and logs startup information.
 * The server is now ready to accept connections.
 */
app.listen(PORT, () => {
  logger.info(`SafeChat API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

/**
 * Export the Express app for testing.
 * This allows test frameworks to import the app without starting the server.
 */
export default app;
