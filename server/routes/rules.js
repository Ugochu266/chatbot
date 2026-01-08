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

// Admin check middleware
function adminCheck(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey.length < 8) {
    throw new AppError('Admin access required', 401, 'UNAUTHORIZED');
  }
  next();
}

// Validate rule type
const VALID_RULE_TYPES = ['blocked_keyword', 'escalation_keyword', 'regex_pattern', 'allowed_topic'];
const VALID_ACTIONS = ['block', 'escalate', 'flag', 'warn'];

function validateRule(body, isUpdate = false) {
  const { ruleType, value, action } = body;

  if (!isUpdate) {
    if (!ruleType || !VALID_RULE_TYPES.includes(ruleType)) {
      throw new AppError(`Invalid rule type. Must be one of: ${VALID_RULE_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
    }
    if (!value || value.trim().length === 0) {
      throw new AppError('Rule value is required', 400, 'VALIDATION_ERROR');
    }
  }

  if (action && !VALID_ACTIONS.includes(action)) {
    throw new AppError(`Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  // Validate regex patterns
  if (body.ruleType === 'regex_pattern' && body.value) {
    try {
      new RegExp(body.value, 'i');
    } catch (e) {
      throw new AppError(`Invalid regex pattern: ${e.message}`, 400, 'VALIDATION_ERROR');
    }
  }
}

// GET /api/admin/rules - List all rules with optional filters
router.get('/', adminCheck, async (req, res, next) => {
  try {
    const { ruleType, category, enabled } = req.query;
    const filters = {};

    if (ruleType) filters.ruleType = ruleType;
    if (category) filters.category = category;
    if (enabled !== undefined) filters.enabled = enabled === 'true';

    const rules = await getSafetyRules(filters);

    res.json({
      success: true,
      rules: rules.map(rule => ({
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

// GET /api/admin/rules/by-type/:type - Get rules by type (for rule engine)
router.get('/by-type/:type', adminCheck, async (req, res, next) => {
  try {
    const { type } = req.params;

    if (!VALID_RULE_TYPES.includes(type)) {
      throw new AppError(`Invalid rule type. Must be one of: ${VALID_RULE_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    const rules = await getRulesByType(type);

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

// GET /api/admin/rules/:id - Get single rule
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

// POST /api/admin/rules - Create new rule
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

// POST /api/admin/rules/bulk - Bulk create rules
router.post('/bulk', adminCheck, async (req, res, next) => {
  try {
    const { rules } = req.body;

    if (!Array.isArray(rules) || rules.length === 0) {
      throw new AppError('Rules array is required', 400, 'VALIDATION_ERROR');
    }

    // Validate all rules first
    rules.forEach((rule, index) => {
      try {
        validateRule(rule);
      } catch (err) {
        throw new AppError(`Rule at index ${index}: ${err.message}`, 400, 'VALIDATION_ERROR');
      }
    });

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

// PUT /api/admin/rules/:id - Update rule
router.put('/:id', adminCheck, async (req, res, next) => {
  try {
    const existing = await getSafetyRuleById(req.params.id);
    if (!existing) {
      throw new AppError('Rule not found', 404, 'NOT_FOUND');
    }

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

// DELETE /api/admin/rules/:id - Delete rule
router.delete('/:id', adminCheck, async (req, res, next) => {
  try {
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

// GET /api/admin/rules/export - Export all rules as JSON
router.get('/export/all', adminCheck, async (req, res, next) => {
  try {
    const rules = await getSafetyRules({});

    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
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

// POST /api/admin/rules/test-all - Test text against ALL enabled safety rules
router.post('/test-all', adminCheck, async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      throw new AppError('Test text is required', 400, 'VALIDATION_ERROR');
    }

    // Get all enabled rules
    const allRules = await getSafetyRules({ enabled: true });

    const matches = [];
    let wouldBlock = false;
    let wouldEscalate = false;
    let wouldWarn = false;
    let wouldFlag = false;

    for (const rule of allRules) {
      let matched = false;
      let matchDetails = null;

      if (rule.rule_type === 'regex_pattern') {
        try {
          const regex = new RegExp(rule.value, 'i');
          const match = text.match(regex);
          matched = !!match;
          matchDetails = match ? { matched: match[0], index: match.index } : null;
        } catch (e) {
          // Skip invalid regex
          continue;
        }
      } else {
        // Keyword matching (blocked_keyword, escalation_keyword, allowed_topic)
        matched = text.toLowerCase().includes(rule.value.toLowerCase());
        if (matched) {
          const index = text.toLowerCase().indexOf(rule.value.toLowerCase());
          matchDetails = { matched: text.substring(index, index + rule.value.length), index };
        }
      }

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

        // Track actions
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

    // Determine overall action (highest priority rule wins)
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

// POST /api/admin/rules/test - Test a rule against sample text
router.post('/test', adminCheck, async (req, res, next) => {
  try {
    const { ruleType, value, testText } = req.body;

    if (!value || !testText) {
      throw new AppError('Rule value and test text are required', 400, 'VALIDATION_ERROR');
    }

    let matched = false;
    let matchDetails = null;

    if (ruleType === 'regex_pattern') {
      try {
        const regex = new RegExp(value, 'i');
        const match = testText.match(regex);
        matched = !!match;
        matchDetails = match ? { matched: match[0], index: match.index } : null;
      } catch (e) {
        throw new AppError(`Invalid regex: ${e.message}`, 400, 'VALIDATION_ERROR');
      }
    } else {
      // Keyword matching
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
