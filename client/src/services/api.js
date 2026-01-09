/**
 * API Configuration Module
 *
 * This module provides the core HTTP client configuration for SafeChat.
 * It creates a pre-configured Axios instance with automatic session handling
 * and centralized error processing.
 *
 * Key Features:
 * - Automatic session ID management via localStorage
 * - Request interceptor for session header injection
 * - Response interceptor for error normalization
 * - Configurable API URL via environment variables
 *
 * Session Flow:
 * 1. On first request, generates UUID and stores in localStorage
 * 2. All subsequent requests include X-Session-Id header
 * 3. Server uses session ID to associate conversations with users
 *
 * @module services/api
 */

import axios from 'axios';

// ═══════════════════════════════════════════════════════════════════════════════
// API CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base URL for API requests.
 *
 * In development: Uses REACT_APP_API_URL env var or defaults to localhost:3001
 * In production: Should be set to the deployed API URL
 */
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * Pre-configured Axios instance for API requests.
 *
 * Configuration:
 * - baseURL: API server URL
 * - timeout: 30 seconds (allows for AI response generation)
 * - Content-Type: JSON for all requests
 */
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30 second timeout for AI response generation
  headers: {
    'Content-Type': 'application/json'
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get or create a session ID for the current user.
 *
 * Session IDs are UUIDs stored in localStorage for persistence across
 * browser sessions. This enables users to see their conversation history
 * even after closing and reopening the browser.
 *
 * Note: Using crypto.randomUUID() for cryptographically secure UUIDs.
 * This is supported in all modern browsers.
 *
 * @returns {string} The user's session UUID
 */
function getSessionId() {
  // Check if session already exists in localStorage
  let sessionId = localStorage.getItem('safechat_session_id');

  // Generate new UUID if no session exists
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('safechat_session_id', sessionId);
  }

  return sessionId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST INTERCEPTOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request interceptor that adds session ID to all outgoing requests.
 *
 * The X-Session-Id header is used by the server to:
 * - Identify the user making the request
 * - Associate conversations and messages with the user
 * - Enforce rate limits per session
 */
api.interceptors.request.use((config) => {
  config.headers['X-Session-Id'] = getSessionId();
  return config;
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE INTERCEPTOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Response interceptor for centralized error handling.
 *
 * Normalizes error messages from different error scenarios:
 * - Server errors (4xx, 5xx): Extracts message from response body
 * - Network errors: Sets generic "Unable to connect" message
 *
 * This allows consuming code to simply use error.message without
 * knowing the error source.
 */
api.interceptors.response.use(
  // Success handler - pass through unchanged
  (response) => response,

  // Error handler - normalize error messages
  (error) => {
    if (error.response) {
      // ─────────────────────────────────────────────────────────────────────────
      // SERVER ERROR (4xx, 5xx)
      // Server responded with an error status code
      // ─────────────────────────────────────────────────────────────────────────
      const message = error.response.data?.message || 'An error occurred';
      error.message = message;
    } else if (error.request) {
      // ─────────────────────────────────────────────────────────────────────────
      // NETWORK ERROR
      // Request was made but no response received (server down, network issue)
      // ─────────────────────────────────────────────────────────────────────────
      error.message = 'Unable to connect to server';
    }
    // Timeout and other errors keep their original message

    return Promise.reject(error);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { api, getSessionId, API_URL };
