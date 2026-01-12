/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Moderation Logs Database Module
 *
 * This module handles logging of content moderation results in SafeChat.
 * Every message that passes through OpenAI's moderation API has its results
 * logged here for auditing, analysis, and debugging purposes.
 *
 * Purpose:
 * - Audit trail for moderation decisions
 * - Data for tuning moderation thresholds
 * - Evidence for compliance requirements
 * - Debugging false positives/negatives
 *
 * Table Schema (moderation_logs):
 * - id: Serial primary key
 * - message_id: Foreign key to messages table
 * - flagged: Boolean - whether OpenAI flagged the content
 * - categories: JSON object with boolean flags per category
 * - scores: JSON object with confidence scores (0-1) per category
 * - created_at: Timestamp
 *
 * OpenAI Moderation Categories Logged:
 * - hate, hate/threatening
 * - harassment, harassment/threatening
 * - self-harm, self-harm/intent, self-harm/instructions
 * - sexual, sexual/minors
 * - violence, violence/graphic
 * - illicit, illicit/violent
 *
 * @module db/moderationLogs
 */

import sql from './index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MODERATION LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log moderation results for a message.
 *
 * Called after each message is checked by OpenAI's moderation API.
 * Stores the complete moderation result including all category flags
 * and confidence scores for later analysis.
 *
 * @param {string} messageId - UUID of the message that was moderated
 * @param {boolean} flagged - Whether OpenAI flagged the content overall
 * @param {Object} categories - Boolean flags for each moderation category
 *   Example: { hate: false, 'self-harm': true, violence: false, ... }
 * @param {Object} scores - Confidence scores (0-1) for each category
 *   Example: { hate: 0.001, 'self-harm': 0.85, violence: 0.02, ... }
 * @returns {Promise<Object>} The created log entry
 *
 * @example
 * await logModeration(
 *   messageId,
 *   true,  // flagged
 *   { hate: false, 'self-harm': true, violence: false },
 *   { hate: 0.001, 'self-harm': 0.85, violence: 0.02 }
 * );
 */
export async function logModeration(messageId, flagged, categories, scores) {
  const result = await sql`
    INSERT INTO moderation_logs (message_id, flagged, categories, scores)
    VALUES (${messageId}, ${flagged}, ${JSON.stringify(categories)}, ${JSON.stringify(scores)})
    RETURNING *
  `;
  return result[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOG RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get moderation log for a specific message.
 *
 * Retrieves the moderation results for a single message.
 * Useful for debugging or investigating why a message was flagged.
 *
 * @param {string} messageId - UUID of the message
 * @returns {Promise<Object|null>} The moderation log entry or null if not found
 */
export async function getModerationLog(messageId) {
  const result = await sql`
    SELECT * FROM moderation_logs WHERE message_id = ${messageId}
  `;
  return result[0] || null;
}

/**
 * Get all flagged moderation logs with message content.
 *
 * Returns a paginated list of messages that were flagged by moderation,
 * joined with the actual message content for admin review. Used by the
 * admin dashboard to review flagged content.
 *
 * @param {number} [page=1] - Page number (1-indexed)
 * @param {number} [limit=20] - Items per page
 * @returns {Promise<Array>} Array of flagged log entries with message content
 *
 * @example
 * const flaggedLogs = await getFlaggedLogs(1, 20);
 * // Each entry includes: id, flagged, categories, scores, content, role
 */
export async function getFlaggedLogs(page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  // ─────────────────────────────────────────────────────────────────────────────
  // JOIN WITH MESSAGES TABLE
  // Include message content and role for admin review context
  // ─────────────────────────────────────────────────────────────────────────────
  const logs = await sql`
    SELECT ml.*, m.content, m.role
    FROM moderation_logs ml
    JOIN messages m ON ml.message_id = m.id
    WHERE ml.flagged = true
    ORDER BY ml.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return logs;
}
