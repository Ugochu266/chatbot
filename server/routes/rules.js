/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Safety Rules Routes Module
 *
 * This module provides REST API endpoints for managing safety rules in SafeChat.
 * Safety rules are the configurable patterns and keywords that the rule engine
 * uses for content filtering, escalation detection, and moderation.
 *
 * Rule Types:
 * - blocked_keyword: Words/phrases that trigger blocking
 * - escalation_keyword: Words/phrases that trigger human review
 * - regex_pattern: Regular expression patterns for complex matching
 * - allowed_topic: Whitelisted topics (for future use)
 *
 * Actions:
 * - block: Prevent message from being processed
 * - escalate: Flag for human review
 * - flag: Mark for logging/analytics
 * - warn: Log warning but allow through
 *
 * Security:
 * - All routes require admin authentication via x-admin-key header
 *
 * Base Path: /api/admin/rules
 *
 * @module routes/rules
 */

import { Router } from 'express';
import {
  getSafetyRules,
  getSafetyRuleById,
  createSafetyRule,
  updateSafetyRule,
  deleteSafetyRule,
  bulkCreateSafetyRules,
  getRulesByType
} from '../db/safetyRules.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Admin authentication middleware.
 * Same as admin.js - requires x-admin-key header.
 *
 * @see routes/admin.js for detailed documentation
 */
function adminCheck(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey.length < 8) {
    throw new AppError('Admin access required', 401, 'UNAUTHORIZED');
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION CONSTANTS AND HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid rule type values.
 * Each type has different matching behavior in the rule engine.
 */
const VALID_RULE_TYPES = [
  'blocked_keyword',     // Simple keyword matching (case-insensitive contains)
  'escalation_keyword',  // Keywords that trigger human review
  'regex_pattern',       // Full regex pattern matching
  'allowed_topic'        // Whitelisted content patterns
];

/**
 * Valid action values.
 * Determines what happens when a rule matches.
 */
const VALID_ACTIONS = [
  'block',     // Stop message processing, return fallback
  'escalate',  // Allow message but flag for human review
  'flag',      // Allow message but log for analytics
  'warn'       // Log warning only, no user impact
];

/**
 * Validate rule data before create/update operations.
 *
 * Checks:
 * - ruleType is valid (required for create)
 * - value is non-empty (required for create)
 * - action is valid if provided
 * - regex patterns are syntactically valid
 *
 * @param {Object} body - Request body containing rule data
 * @param {boolean} [isUpdate=false] - If true, fields are optional
 * @throws {AppError} 400 if validation fails
 */
function validateRule(body, isUpdate = false) {
  const { ruleType, value, action } = body;

  // For new rules, ruleType and value are required
  if (!isUpdate) {
    if (!ruleType || !VALID_RULE_TYPES.includes(ruleType)) {
      throw new AppError(`Invalid rule type. Must be one of: ${VALID_RULE_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
    }
    if (!value || value.trim().length === 0) {
      throw new AppError('Rule value is required', 400, 'VALIDATION_ERROR');
    }
  }

  // Validate action if provided
  if (action && !VALID_ACTIONS.includes(action)) {
    throw new AppError(`Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REGEX VALIDATION
  // For regex_pattern rules, verify the pattern is syntactically valid
  // This prevents invalid regex from breaking the rule engine at runtime
  // ─────────────────────────────────────────────────────────────────────────────
  if (body.ruleType === 'regex_pattern' && body.value) {
    try {
      new RegExp(body.value, 'i');  // Test pattern compilation
    } catch (e) {
      throw new AppError(`Invalid regex pattern: ${e.message}`, 400, 'VALIDATION_ERROR');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RULE LISTING ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/rules
 *
 * List all safety rules with optional filtering.
 *
 * Query Parameters:
 * - ruleType {string} - Filter by rule type
 * - category {string} - Filter by category
 * - enabled {boolean} - Filter by enabled status ('true' or 'false')
 *
 * Response:
 * - rules: Array of rule objects
 * - meta: Valid values for ruleTypes and actions
 */
router.get('/', adminCheck, async (req, res, next) => {
  try {
    const { ruleType, category, enabled } = req.query;

    // Build filters object from query parameters
    const filters = {};
    if (ruleType) filters.ruleType = ruleType;
    if (category) filters.category = category;
    if (enabled !== undefined) filters.enabled = enabled === 'true';

    const rules = await getSafetyRules(filters);

    res.json({
      success: true,
      rules: rules.map(rule => ({
        id: rule.id,
        ruleType: rule.rule_type,      // Type of matching (keyword, regex, etc.)
        category: rule.category,        // Grouping category (crisis, legal, etc.)
        value: rule.value,              // The pattern or keyword
        action: rule.action,            // What to do on match
        priority: rule.priority,        // Higher priority rules processed first
        enabled: rule.enabled,          // Whether the rule is active
        description: rule.description,  // Human-readable description
        createdBy: rule.created_by,     // Who created the rule
        createdAt: rule.created_at,
        updatedAt: rule.updated_at
      })),
      meta: {
        validRuleTypes: VALID_RULE_TYPES,
        validActions: VALID_ACTIONS
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/rules/by-type/:type
 *
 * Get rules filtered by type (optimized for rule engine).
 * Returns a simplified format with only fields needed for matching.
 *
 * Path Parameters:
 * - type {string} - Rule type (blocked_keyword, regex_pattern, etc.)
 *
 * Response:
 * - rules: Array of simplified rule objects
 */
router.get('/by-type/:type', adminCheck, async (req, res, next) => {
  try {
    const { type } = req.params;

    // Validate the type parameter
    if (!VALID_RULE_TYPES.includes(type)) {
      throw new AppError(`Invalid rule type. Must be one of: ${VALID_RULE_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    const rules = await getRulesByType(type);

    // Return simplified format for rule engine consumption
    res.json({
      success: true,
      rules: rules.map(rule => ({
        id: rule.id,
        value: rule.value,
        action: rule.action,
        category: rule.category,
        priority: rule.priority
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/rules/:id
 *
 * Get a single rule by ID.
 *
 * Path Parameters:
 * - id {uuid} - Rule ID
 *
 * Response:
 * - rule: Full rule object
 *
 * Errors:
 * - 404: Rule not found
 */
router.get('/:id', adminCheck, async (req, res, next) => {
  try {
    const rule = await getSafetyRuleById(req.params.id);

    if (!rule) {
      throw new AppError('Rule not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      rule: {
        id: rule.id,
        ruleType: rule.rule_type,
        category: rule.category,
        value: rule.value,
        action: rule.action,
        priority: rule.priority,
        enabled: rule.enabled,
        description: rule.description,
        createdBy: rule.created_by,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RULE CREATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/rules
 *
 * Create a new safety rule.
 *
 * Request Body:
 * - ruleType {string} - Type of rule (required)
 * - value {string} - Pattern or keyword (required)
 * - category {string} - Grouping category (optional)
 * - action {string} - Action on match (default: 'block')
 * - priority {number} - Processing priority (default: 0)
 * - enabled {boolean} - Is rule active (default: true)
 * - description {string} - Human-readable description (optional)
 * - createdBy {string} - Creator identifier (default: 'admin')
 *
 * Response:
 * - rule: The created rule
 *
 * Status Codes:
 * - 201: Rule created
 * - 400: Validation error
 */
router.post('/', adminCheck, async (req, res, next) => {
  try {
    validateRule(req.body);

    const rule = await createSafetyRule({
      ruleType: req.body.ruleType,
      category: req.body.category,
      value: req.body.value,
      action: req.body.action || 'block',
      priority: req.body.priority || 0,
      enabled: req.body.enabled !== false,
      description: req.body.description,
      createdBy: req.body.createdBy || 'admin'
    });

    res.status(201).json({
      success: true,
      rule: {
        id: rule.id,
        ruleType: rule.rule_type,
        category: rule.category,
        value: rule.value,
        action: rule.action,
        priority: rule.priority,
        enabled: rule.enabled,
        description: rule.description,
        createdBy: rule.created_by,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/rules/bulk
 *
 * Create multiple rules at once.
 * Useful for importing rule sets or seeding initial rules.
 *
 * Request Body:
 * - rules {Array} - Array of rule objects (same format as POST /rules)
 *
 * Response:
 * - created: Number of rules created
 * - rules: Array of created rule summaries
 *
 * Validation:
 * - All rules are validated before any are created
 * - If one rule fails validation, none are created
 */
router.post('/bulk', adminCheck, async (req, res, next) => {
  try {
    const { rules } = req.body;

    // Validate input is a non-empty array
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new AppError('Rules array is required', 400, 'VALIDATION_ERROR');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PRE-VALIDATION
    // Validate all rules before creating any to ensure atomicity
    // If any rule fails validation, the error includes the index for debugging
    // ─────────────────────────────────────────────────────────────────────────────
    rules.forEach((rule, index) => {
      try {
        validateRule(rule);
      } catch (err) {
        throw new AppError(`Rule at index ${index}: ${err.message}`, 400, 'VALIDATION_ERROR');
      }
    });

    // All rules valid - create them
    const created = await bulkCreateSafetyRules(rules);

    res.status(201).json({
      success: true,
      created: created.length,
      rules: created.map(rule => ({
        id: rule.id,
        ruleType: rule.rule_type,
        value: rule.value
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RULE UPDATE/DELETE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PUT /api/admin/rules/:id
 *
 * Update an existing rule.
 * Only provided fields are updated; others remain unchanged.
 *
 * Path Parameters:
 * - id {uuid} - Rule ID
 *
 * Request Body:
 * - Any rule fields to update (all optional)
 *
 * Response:
 * - rule: The updated rule
 *
 * Errors:
 * - 400: Validation error
 * - 404: Rule not found
 */
router.put('/:id', adminCheck, async (req, res, next) => {
  try {
    // Verify rule exists before updating
    const existing = await getSafetyRuleById(req.params.id);
    if (!existing) {
      throw new AppError('Rule not found', 404, 'NOT_FOUND');
    }

    // Validate with isUpdate=true (fields are optional)
    validateRule(req.body, true);

    const rule = await updateSafetyRule(req.params.id, {
      ruleType: req.body.ruleType,
      category: req.body.category,
      value: req.body.value,
      action: req.body.action,
      priority: req.body.priority,
      enabled: req.body.enabled,
      description: req.body.description
    });

    res.json({
      success: true,
      rule: {
        id: rule.id,
        ruleType: rule.rule_type,
        category: rule.category,
        value: rule.value,
        action: rule.action,
        priority: rule.priority,
        enabled: rule.enabled,
        description: rule.description,
        createdBy: rule.created_by,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/rules/:id
 *
 * Delete a rule from the system.
 * The rule will no longer be used for content filtering.
 *
 * Path Parameters:
 * - id {uuid} - Rule ID
 *
 * Response:
 * - message: Success confirmation
 *
 * Errors:
 * - 404: Rule not found
 */
router.delete('/:id', adminCheck, async (req, res, next) => {
  try {
    // Verify rule exists before deleting
    const existing = await getSafetyRuleById(req.params.id);
    if (!existing) {
      throw new AppError('Rule not found', 404, 'NOT_FOUND');
    }

    await deleteSafetyRule(req.params.id);

    res.json({
      success: true,
      message: 'Rule deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RULE EXPORT ROUTE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/rules/export/all
 *
 * Export all rules as JSON.
 * Useful for backup, migration, or sharing rule sets.
 *
 * Response:
 * - exportedAt: Timestamp of export
 * - rules: Array of rules without IDs (for portability)
 */
router.get('/export/all', adminCheck, async (req, res, next) => {
  try {
    const rules = await getSafetyRules({});

    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      // Export without IDs so rules can be imported to another system
      rules: rules.map(rule => ({
        ruleType: rule.rule_type,
        category: rule.category,
        value: rule.value,
        action: rule.action,
        priority: rule.priority,
        enabled: rule.enabled,
        description: rule.description
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RULE TESTING ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/rules/test-all
 *
 * Test text against ALL enabled safety rules.
 * Shows which rules would match and what overall action would be taken.
 *
 * This is a powerful debugging tool that simulates what would happen
 * if the text was processed by the safety pipeline.
 *
 * Request Body:
 * - text {string} - Text to test against rules
 *
 * Response:
 * - result: Object containing:
 *   - text: First 200 chars of input
 *   - totalRulesChecked: Number of rules tested
 *   - matchCount: Number of rules that matched
 *   - matches: Array of matching rule details
 *   - overallAction: Highest priority action that would be taken
 *   - wouldBlock/Escalate/Warn/Flag: Boolean flags for each action type
 *   - categoriesMatched: Unique categories of matched rules
 */
router.post('/test-all', adminCheck, async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      throw new AppError('Test text is required', 400, 'VALIDATION_ERROR');
    }

    // Get all enabled rules for testing
    const allRules = await getSafetyRules({ enabled: true });

    const matches = [];
    let wouldBlock = false;
    let wouldEscalate = false;
    let wouldWarn = false;
    let wouldFlag = false;

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST EACH RULE
    // Different rule types have different matching strategies
    // ─────────────────────────────────────────────────────────────────────────────
    for (const rule of allRules) {
      let matched = false;
      let matchDetails = null;

      if (rule.rule_type === 'regex_pattern') {
        // Regex matching - use the pattern as a regular expression
        try {
          const regex = new RegExp(rule.value, 'i');
          const match = text.match(regex);
          matched = !!match;
          matchDetails = match ? { matched: match[0], index: match.index } : null;
        } catch (e) {
          // Skip invalid regex patterns
          continue;
        }
      } else {
        // Keyword matching - case-insensitive substring search
        matched = text.toLowerCase().includes(rule.value.toLowerCase());
        if (matched) {
          const index = text.toLowerCase().indexOf(rule.value.toLowerCase());
          matchDetails = { matched: text.substring(index, index + rule.value.length), index };
        }
      }

      // Record match details if rule matched
      if (matched) {
        matches.push({
          ruleId: rule.id,
          ruleType: rule.rule_type,
          category: rule.category,
          value: rule.value,
          action: rule.action,
          priority: rule.priority,
          description: rule.description,
          matchDetails
        });

        // Track which actions would be triggered
        switch (rule.action) {
          case 'block': wouldBlock = true; break;
          case 'escalate': wouldEscalate = true; break;
          case 'warn': wouldWarn = true; break;
          case 'flag': wouldFlag = true; break;
        }
      }
    }

    // Sort matches by priority (highest first)
    matches.sort((a, b) => b.priority - a.priority);

    // ─────────────────────────────────────────────────────────────────────────────
    // DETERMINE OVERALL ACTION
    // In the real pipeline, the highest-priority action wins
    // Priority order: block > escalate > warn > flag > allow
    // ─────────────────────────────────────────────────────────────────────────────
    let overallAction = 'allow';
    if (wouldBlock) overallAction = 'block';
    else if (wouldEscalate) overallAction = 'escalate';
    else if (wouldWarn) overallAction = 'warn';
    else if (wouldFlag) overallAction = 'flag';

    res.json({
      success: true,
      result: {
        text: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
        totalRulesChecked: allRules.length,
        matchCount: matches.length,
        matches,
        overallAction,
        wouldBlock,
        wouldEscalate,
        wouldWarn,
        wouldFlag,
        categoriesMatched: [...new Set(matches.map(m => m.category).filter(Boolean))]
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/rules/test
 *
 * Test a single rule pattern against sample text.
 * Useful for validating rule patterns before saving.
 *
 * Request Body:
 * - ruleType {string} - Type of rule to test
 * - value {string} - Pattern or keyword to test
 * - testText {string} - Text to test against
 *
 * Response:
 * - result: Object containing:
 *   - matched: Whether the pattern matched
 *   - matchDetails: What was matched and where
 *   - testText: First 200 chars of test text
 */
router.post('/test', adminCheck, async (req, res, next) => {
  try {
    const { ruleType, value, testText } = req.body;

    if (!value || !testText) {
      throw new AppError('Rule value and test text are required', 400, 'VALIDATION_ERROR');
    }

    let matched = false;
    let matchDetails = null;

    if (ruleType === 'regex_pattern') {
      // Test as regex pattern
      try {
        const regex = new RegExp(value, 'i');
        const match = testText.match(regex);
        matched = !!match;
        matchDetails = match ? { matched: match[0], index: match.index } : null;
      } catch (e) {
        throw new AppError(`Invalid regex: ${e.message}`, 400, 'VALIDATION_ERROR');
      }
    } else {
      // Test as keyword (case-insensitive contains)
      matched = testText.toLowerCase().includes(value.toLowerCase());
      if (matched) {
        const index = testText.toLowerCase().indexOf(value.toLowerCase());
        matchDetails = { matched: testText.substring(index, index + value.length), index };
      }
    }

    res.json({
      success: true,
      result: {
        matched,
        matchDetails,
        testText: testText.substring(0, 200)
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
