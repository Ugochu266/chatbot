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

// Admin check middleware
function adminCheck(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey.length < 8) {
    throw new AppError('Admin access required', 401, 'UNAUTHORIZED');
  }
  next();
}

// Valid moderation categories (OpenAI API)
const MODERATION_CATEGORIES = [
  'hate', 'hate/threatening', 'harassment', 'harassment/threatening',
  'self-harm', 'self-harm/intent', 'self-harm/instructions',
  'sexual', 'sexual/minors', 'violence', 'violence/graphic'
];

const VALID_ACTIONS = ['block', 'escalate', 'flag', 'warn'];

// ============================================
// Moderation Settings Routes
// ============================================

// GET /api/admin/settings/moderation - Get all moderation settings
router.get('/moderation', adminCheck, async (req, res, next) => {
  try {
    const settings = await getModerationSettings();

    res.json({
      success: true,
      settings: settings.map(s => ({
        id: s.id,
        category: s.category,
        enabled: s.enabled,
        threshold: parseFloat(s.threshold),
        action: s.action,
        updatedAt: s.updated_at
      })),
      meta: {
        categories: MODERATION_CATEGORIES,
        validActions: VALID_ACTIONS
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/settings/moderation/:category - Get single moderation setting
router.get('/moderation/:category', adminCheck, async (req, res, next) => {
  try {
    const { category } = req.params;

    if (!MODERATION_CATEGORIES.includes(category)) {
      throw new AppError(`Invalid category. Must be one of: ${MODERATION_CATEGORIES.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    const setting = await getModerationSettingByCategory(category);

    if (!setting) {
      // Return default if not set
      res.json({
        success: true,
        setting: {
          category,
          enabled: true,
          threshold: 0.7,
          action: 'block',
          isDefault: true
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

// PUT /api/admin/settings/moderation/:category - Update moderation setting
router.put('/moderation/:category', adminCheck, async (req, res, next) => {
  try {
    const { category } = req.params;
    const { enabled, threshold, action } = req.body;

    if (!MODERATION_CATEGORIES.includes(category)) {
      throw new AppError(`Invalid category. Must be one of: ${MODERATION_CATEGORIES.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    if (threshold !== undefined && (threshold < 0 || threshold > 1)) {
      throw new AppError('Threshold must be between 0 and 1', 400, 'VALIDATION_ERROR');
    }

    if (action && !VALID_ACTIONS.includes(action)) {
      throw new AppError(`Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    const setting = await upsertModerationSetting({
      category,
      enabled: enabled !== false,
      threshold: threshold || 0.7,
      action: action || 'block'
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

// POST /api/admin/settings/moderation/test - Test moderation with sample text
router.post('/moderation/test', adminCheck, async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text) {
      throw new AppError('Text is required for moderation test', 400, 'VALIDATION_ERROR');
    }

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

// ============================================
// Escalation Settings Routes
// ============================================

// GET /api/admin/settings/escalation - Get all escalation settings
router.get('/escalation', adminCheck, async (req, res, next) => {
  try {
    const settings = await getEscalationSettings();

    res.json({
      success: true,
      settings: settings.map(s => ({
        id: s.id,
        category: s.category,
        enabled: s.enabled,
        keywords: s.keywords || [],
        responseTemplate: s.response_template,
        priority: s.priority,
        updatedAt: s.updated_at
      })),
      meta: {
        defaultCategories: ['crisis', 'legal', 'complaint', 'sentiment']
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/settings/escalation/:category - Get single escalation setting
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

// PUT /api/admin/settings/escalation/:category - Update escalation setting
router.put('/escalation/:category', adminCheck, async (req, res, next) => {
  try {
    const { category } = req.params;
    const { enabled, keywords, responseTemplate, priority } = req.body;

    if (keywords && !Array.isArray(keywords)) {
      throw new AppError('Keywords must be an array', 400, 'VALIDATION_ERROR');
    }

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

// POST /api/admin/settings/escalation/test - Test escalation detection
router.post('/escalation/test', adminCheck, async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text) {
      throw new AppError('Text is required for escalation test', 400, 'VALIDATION_ERROR');
    }

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

// ============================================
// System Settings Routes
// ============================================

// GET /api/admin/settings/system - Get all system settings
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

// GET /api/admin/settings/system/:key - Get single system setting
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

// PUT /api/admin/settings/system/:key - Update system setting
router.put('/system/:key', adminCheck, async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

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

// DELETE /api/admin/settings/system/:key - Delete system setting
router.delete('/system/:key', adminCheck, async (req, res, next) => {
  try {
    const { key } = req.params;
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
