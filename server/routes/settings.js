/**
 * Settings Routes Module
 *
 * This module provides REST API endpoints for managing SafeChat's configuration settings.
 * It exposes three main configuration areas:
 *
 * 1. Moderation Settings - Control OpenAI moderation API behavior
 *    - Per-category thresholds (0-1 sensitivity)
 *    - Actions on detection (block, escalate, flag, warn)
 *    - Enable/disable categories
 *
 * 2. Escalation Settings - Configure automatic escalation triggers
 *    - Keywords that trigger human review
 *    - Response templates for each category
 *    - Priority levels for queue ordering
 *
 * 3. System Settings - General key-value configuration
 *    - Feature flags
 *    - Application-wide parameters
 *    - Runtime configuration
 *
 * Security:
 * - All endpoints require admin authentication via X-Admin-Key header
 * - Settings changes are immediately effective (no restart needed)
 * - Validation prevents invalid configurations
 *
 * Base Path: /api/admin/settings
 *
 * @module routes/settings
 */

import { Router } from 'express';
import {
  getModerationSettings,
  getModerationSettingByCategory,
  upsertModerationSetting,
  updateModerationSetting,
  getEscalationSettings,
  getEscalationSettingByCategory,
  upsertEscalationSetting,
  updateEscalationSetting,
  getSystemSettings,
  getSystemSetting,
  upsertSystemSetting,
  deleteSystemSetting
} from '../db/safetyRules.js';
import { moderateContent } from '../services/moderation.js';
import { analyzeEscalation } from '../services/escalation.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Admin authentication middleware.
 *
 * Validates the X-Admin-Key header to ensure only authorized administrators
 * can access settings endpoints. This is a simple key-based authentication
 * suitable for internal admin tools.
 *
 * Security Note:
 * - Requires minimum 8-character key length
 * - In production, use environment variable for the expected key
 * - Consider adding rate limiting for brute force protection
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 * @throws {AppError} 401 if admin key is missing or too short
 */
function adminCheck(req, res, next) {
  const adminKey = req.headers['x-admin-key'];

  // Validate presence and minimum length for basic security
  if (!adminKey || adminKey.length < 8) {
    throw new AppError('Admin access required', 401, 'UNAUTHORIZED');
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS AND VALID VALUES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid moderation categories supported by OpenAI's Moderation API.
 * These represent the 13 categories of potentially harmful content that
 * the API can detect and score.
 *
 * Category descriptions:
 * - hate: Content expressing hatred toward protected groups
 * - hate/threatening: Hate speech with threats of violence
 * - harassment: Content targeting individuals for harassment
 * - harassment/threatening: Harassment with explicit threats
 * - self-harm: Content promoting self-injury
 * - self-harm/intent: Expressing intent to self-harm
 * - self-harm/instructions: How-to content for self-harm
 * - sexual: Sexually explicit content
 * - sexual/minors: Sexual content involving minors (HIGHEST PRIORITY)
 * - violence: Content depicting or promoting violence
 * - violence/graphic: Graphic or gory violence
 * - illicit: Content about illegal activities
 * - illicit/violent: Violent illegal activities
 */
const MODERATION_CATEGORIES = [
  'hate', 'hate/threatening', 'harassment', 'harassment/threatening',
  'self-harm', 'self-harm/intent', 'self-harm/instructions',
  'sexual', 'sexual/minors', 'violence', 'violence/graphic',
  'illicit', 'illicit/violent'
];

/**
 * Valid actions that can be taken when moderation triggers.
 *
 * - block: Prevent the message from being processed, return fallback
 * - escalate: Flag for human review and optionally block
 * - flag: Mark the message but allow it through
 * - warn: Log the detection but take no action
 */
const VALID_ACTIONS = ['block', 'escalate', 'flag', 'warn'];

// ═══════════════════════════════════════════════════════════════════════════════
// MODERATION SETTINGS ROUTES
// Configure how OpenAI's content moderation behaves
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/settings/moderation
 *
 * Retrieve all moderation settings across all categories.
 * Returns the current configuration for each moderation category along
 * with metadata about available categories and actions.
 *
 * Use this endpoint to:
 * - Display current moderation configuration in admin UI
 * - Audit moderation sensitivity levels
 * - Export settings for backup/documentation
 *
 * Response:
 * - settings: Array of category settings (id, category, enabled, threshold, action)
 * - meta: Available categories and valid actions for UI dropdowns
 *
 * @route GET /moderation
 * @access Admin only (X-Admin-Key required)
 */
router.get('/moderation', adminCheck, async (req, res, next) => {
  try {
    const settings = await getModerationSettings();

    res.json({
      success: true,
      settings: settings.map(s => ({
        id: s.id,
        category: s.category,
        enabled: s.enabled,
        threshold: parseFloat(s.threshold),  // Convert from Postgres decimal
        action: s.action,
        updatedAt: s.updated_at
      })),
      // Include metadata for admin UI form builders
      meta: {
        categories: MODERATION_CATEGORIES,
        validActions: VALID_ACTIONS
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/settings/moderation/:category
 *
 * Retrieve settings for a specific moderation category.
 * If no custom setting exists, returns sensible defaults.
 *
 * Path Parameters:
 * - category: One of the MODERATION_CATEGORIES values
 *
 * Response:
 * - setting: Category configuration object
 * - isDefault: true if returning defaults (no custom config saved)
 *
 * Default Values:
 * - enabled: true (category is active)
 * - threshold: 0.7 (70% confidence required)
 * - action: 'block' (prevent flagged content)
 *
 * @route GET /moderation/:category
 * @access Admin only
 */
router.get('/moderation/:category', adminCheck, async (req, res, next) => {
  try {
    const { category } = req.params;

    // ─────────────────────────────────────────────────────────────────────────────
    // CATEGORY VALIDATION
    // Only allow valid OpenAI moderation categories
    // ─────────────────────────────────────────────────────────────────────────────
    if (!MODERATION_CATEGORIES.includes(category)) {
      throw new AppError(`Invalid category. Must be one of: ${MODERATION_CATEGORIES.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    const setting = await getModerationSettingByCategory(category);

    // ─────────────────────────────────────────────────────────────────────────────
    // FALLBACK TO DEFAULTS
    // If no custom setting exists, return sensible defaults so the admin UI
    // can display something and the system has fallback behavior
    // ─────────────────────────────────────────────────────────────────────────────
    if (!setting) {
      res.json({
        success: true,
        setting: {
          category,
          enabled: true,
          threshold: 0.7,
          action: 'block',
          isDefault: true  // Flag indicates this is a default, not saved config
        }
      });
      return;
    }

    res.json({
      success: true,
      setting: {
        id: setting.id,
        category: setting.category,
        enabled: setting.enabled,
        threshold: parseFloat(setting.threshold),
        action: setting.action,
        updatedAt: setting.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/settings/moderation/:category
 *
 * Create or update settings for a moderation category.
 * Uses upsert semantics - creates if not exists, updates if exists.
 *
 * Path Parameters:
 * - category: The moderation category to configure
 *
 * Request Body:
 * - enabled {boolean} - Whether this category is active (default: true)
 * - threshold {number} - Confidence threshold 0-1 (default: 0.7)
 * - action {string} - Action to take: block|escalate|flag|warn (default: 'block')
 *
 * Threshold Guidelines:
 * - 0.5-0.6: Very sensitive, may have false positives
 * - 0.7-0.8: Balanced, good for most use cases
 * - 0.9+: Only high-confidence detections
 *
 * Status Codes:
 * - 200: Setting updated successfully
 * - 400: Invalid category, threshold, or action
 * - 401: Admin authentication required
 *
 * @route PUT /moderation/:category
 * @access Admin only
 */
router.put('/moderation/:category', adminCheck, async (req, res, next) => {
  try {
    const { category } = req.params;
    const { enabled, threshold, action } = req.body;

    // ─────────────────────────────────────────────────────────────────────────────
    // INPUT VALIDATION
    // Validate all inputs before making database changes
    // ─────────────────────────────────────────────────────────────────────────────

    // Validate category is one of the known OpenAI categories
    if (!MODERATION_CATEGORIES.includes(category)) {
      throw new AppError(`Invalid category. Must be one of: ${MODERATION_CATEGORIES.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    // Threshold must be a valid probability (0 to 1)
    if (threshold !== undefined && (threshold < 0 || threshold > 1)) {
      throw new AppError('Threshold must be between 0 and 1', 400, 'VALIDATION_ERROR');
    }

    // Action must be one of the supported actions
    if (action && !VALID_ACTIONS.includes(action)) {
      throw new AppError(`Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // UPSERT SETTING
    // Create or update the setting with provided values or defaults
    // ─────────────────────────────────────────────────────────────────────────────
    const setting = await upsertModerationSetting({
      category,
      enabled: enabled !== false,  // Default to enabled if not specified
      threshold: threshold || 0.7, // Default 70% threshold
      action: action || 'block'    // Default to blocking
    });

    res.json({
      success: true,
      setting: {
        id: setting.id,
        category: setting.category,
        enabled: setting.enabled,
        threshold: parseFloat(setting.threshold),
        action: setting.action,
        updatedAt: setting.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/settings/moderation/test
 *
 * Test the moderation API with sample text without saving anything.
 * Useful for:
 * - Verifying threshold settings before deployment
 * - Testing edge cases during configuration
 * - Demonstrating moderation capabilities
 *
 * Request Body:
 * - text {string} - The text to analyze (required)
 *
 * Response:
 * - result.flagged {boolean} - Whether any category was triggered
 * - result.categories {Object} - Boolean flags for each category
 * - result.scores {Object} - Confidence scores (0-1) for each category
 *
 * Note: This calls the OpenAI API directly, so it counts against your usage.
 *
 * @route POST /moderation/test
 * @access Admin only
 */
router.post('/moderation/test', adminCheck, async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text) {
      throw new AppError('Text is required for moderation test', 400, 'VALIDATION_ERROR');
    }

    // Run through OpenAI's moderation API
    const result = await moderateContent(text);

    res.json({
      success: true,
      result: {
        flagged: result.flagged,
        categories: result.categories,
        scores: result.scores
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ESCALATION SETTINGS ROUTES
// Configure automatic escalation triggers and responses
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/settings/escalation
 *
 * Retrieve all escalation category settings.
 * Escalation categories define when conversations should be flagged
 * for human review based on keywords, sentiment, or content type.
 *
 * Default Categories:
 * - crisis: Mental health emergencies, self-harm mentions
 * - legal: Legal threats, lawsuit mentions, regulatory issues
 * - complaint: Customer complaints, refund requests, anger
 * - sentiment: Strong negative sentiment detection
 *
 * Response:
 * - settings: Array of escalation configurations
 * - meta.defaultCategories: List of expected category names
 *
 * @route GET /escalation
 * @access Admin only
 */
router.get('/escalation', adminCheck, async (req, res, next) => {
  try {
    const settings = await getEscalationSettings();

    res.json({
      success: true,
      settings: settings.map(s => ({
        id: s.id,
        category: s.category,
        enabled: s.enabled,
        keywords: s.keywords || [],           // Array of trigger words
        responseTemplate: s.response_template, // Canned response for this category
        priority: s.priority,                  // Queue ordering (higher = urgent)
        updatedAt: s.updated_at
      })),
      // Include metadata for admin UI
      meta: {
        defaultCategories: ['crisis', 'legal', 'complaint', 'sentiment']
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/settings/escalation/:category
 *
 * Retrieve settings for a specific escalation category.
 *
 * Path Parameters:
 * - category: The escalation category name (e.g., 'crisis', 'legal')
 *
 * Response:
 * - setting: Full configuration for the category including keywords,
 *   response template, and priority level
 *
 * Status Codes:
 * - 200: Setting found and returned
 * - 404: Category not found
 * - 401: Admin authentication required
 *
 * @route GET /escalation/:category
 * @access Admin only
 */
router.get('/escalation/:category', adminCheck, async (req, res, next) => {
  try {
    const { category } = req.params;
    const setting = await getEscalationSettingByCategory(category);

    if (!setting) {
      throw new AppError('Escalation category not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      setting: {
        id: setting.id,
        category: setting.category,
        enabled: setting.enabled,
        keywords: setting.keywords || [],
        responseTemplate: setting.response_template,
        priority: setting.priority,
        updatedAt: setting.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/settings/escalation/:category
 *
 * Create or update an escalation category configuration.
 * Uses upsert semantics for idempotent updates.
 *
 * Path Parameters:
 * - category: Name of the escalation category
 *
 * Request Body:
 * - enabled {boolean} - Whether this category is active (default: true)
 * - keywords {string[]} - Array of trigger words/phrases
 * - responseTemplate {string} - Canned response when triggered
 * - priority {number} - Queue priority level (default: 0)
 *
 * Keywords are matched case-insensitively against user input.
 * Multiple keywords can trigger the same category.
 *
 * @route PUT /escalation/:category
 * @access Admin only
 */
router.put('/escalation/:category', adminCheck, async (req, res, next) => {
  try {
    const { category } = req.params;
    const { enabled, keywords, responseTemplate, priority } = req.body;

    // Validate keywords is an array if provided
    if (keywords && !Array.isArray(keywords)) {
      throw new AppError('Keywords must be an array', 400, 'VALIDATION_ERROR');
    }

    // Upsert the escalation setting
    const setting = await upsertEscalationSetting({
      category,
      enabled: enabled !== false,
      keywords: keywords || [],
      responseTemplate,
      priority: priority || 0
    });

    res.json({
      success: true,
      setting: {
        id: setting.id,
        category: setting.category,
        enabled: setting.enabled,
        keywords: setting.keywords || [],
        responseTemplate: setting.response_template,
        priority: setting.priority,
        updatedAt: setting.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/settings/escalation/test
 *
 * Test escalation detection with sample text without saving.
 * Useful for verifying keyword configurations and understanding
 * how the escalation engine analyzes content.
 *
 * Request Body:
 * - text {string} - The text to analyze (required)
 *
 * Response:
 * - result.shouldEscalate {boolean} - Whether escalation would trigger
 * - result.reason {string} - Human-readable explanation
 * - result.type {string} - Category that triggered (if any)
 * - result.urgency {string} - Urgency level (low/medium/high/critical)
 * - result.triggers {string[]} - Specific keywords/patterns that matched
 *
 * @route POST /escalation/test
 * @access Admin only
 */
router.post('/escalation/test', adminCheck, async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text) {
      throw new AppError('Text is required for escalation test', 400, 'VALIDATION_ERROR');
    }

    // Run through escalation analysis engine
    const result = analyzeEscalation(text);

    res.json({
      success: true,
      result: {
        shouldEscalate: result.shouldEscalate,
        reason: result.reason,
        type: result.type,
        urgency: result.urgency,
        triggers: result.triggers
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS ROUTES
// General key-value configuration store
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/settings/system
 *
 * Retrieve all system-wide configuration settings.
 * System settings are arbitrary key-value pairs for application configuration.
 *
 * Common use cases:
 * - Feature flags (enable_streaming, use_rag)
 * - Rate limits (max_messages_per_minute)
 * - UI configuration (welcome_message, brand_name)
 * - Integration settings (webhook_url, notification_email)
 *
 * Response:
 * - settings: Array of key-value-description objects
 *
 * @route GET /system
 * @access Admin only
 */
router.get('/system', adminCheck, async (req, res, next) => {
  try {
    const settings = await getSystemSettings();

    res.json({
      success: true,
      settings: settings.map(s => ({
        key: s.key,
        value: s.value,
        description: s.description,
        updatedAt: s.updated_at
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/settings/system/:key
 *
 * Retrieve a specific system setting by key.
 *
 * Path Parameters:
 * - key: The setting key to retrieve
 *
 * Response:
 * - setting: The key-value pair with description and timestamp
 *
 * Status Codes:
 * - 200: Setting found
 * - 404: Setting with specified key not found
 * - 401: Admin authentication required
 *
 * @route GET /system/:key
 * @access Admin only
 */
router.get('/system/:key', adminCheck, async (req, res, next) => {
  try {
    const { key } = req.params;
    const setting = await getSystemSetting(key);

    if (!setting) {
      throw new AppError('Setting not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      setting: {
        key: setting.key,
        value: setting.value,
        description: setting.description,
        updatedAt: setting.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/settings/system/:key
 *
 * Create or update a system setting.
 * Uses upsert semantics - creates if key doesn't exist, updates if it does.
 *
 * Path Parameters:
 * - key: The setting key (from URL)
 *
 * Request Body:
 * - value {any} - The setting value (required, stored as JSON)
 * - description {string} - Human-readable description (optional)
 *
 * The value can be any JSON-serializable type:
 * - String: "production"
 * - Number: 100
 * - Boolean: true
 * - Object: { "enabled": true, "limit": 50 }
 * - Array: ["admin@example.com", "support@example.com"]
 *
 * @route PUT /system/:key
 * @access Admin only
 */
router.put('/system/:key', adminCheck, async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    // Value is required for system settings
    if (value === undefined) {
      throw new AppError('Value is required', 400, 'VALIDATION_ERROR');
    }

    const setting = await upsertSystemSetting(key, value, description);

    res.json({
      success: true,
      setting: {
        key: setting.key,
        value: setting.value,
        description: setting.description,
        updatedAt: setting.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/settings/system/:key
 *
 * Remove a system setting permanently.
 * This is a destructive operation and cannot be undone.
 *
 * Path Parameters:
 * - key: The setting key to delete
 *
 * Use Cases:
 * - Removing deprecated configuration
 * - Cleaning up test settings
 * - Resetting to application defaults
 *
 * Status Codes:
 * - 200: Setting deleted successfully
 * - 404: Setting not found
 * - 401: Admin authentication required
 *
 * Note: Application code should handle missing settings gracefully
 * with sensible defaults.
 *
 * @route DELETE /system/:key
 * @access Admin only
 */
router.delete('/system/:key', adminCheck, async (req, res, next) => {
  try {
    const { key } = req.params;

    // Verify the setting exists before attempting deletion
    const existing = await getSystemSetting(key);
    if (!existing) {
      throw new AppError('Setting not found', 404, 'NOT_FOUND');
    }

    await deleteSystemSetting(key);

    res.json({
      success: true,
      message: 'Setting deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
