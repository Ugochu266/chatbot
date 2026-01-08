import OpenAI from 'openai';
import { logger } from '../middleware/errorHandler.js';
import { logModeration } from '../db/moderationLogs.js';
import ruleEngine from './ruleEngine.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Fallback categories list (used when rule engine is unavailable)
const ALL_CATEGORIES = [
  'hate',
  'hate/threatening',
  'harassment',
  'harassment/threatening',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
  'sexual',
  'sexual/minors',
  'violence',
  'violence/graphic'
];

// Moderate content using OpenAI Moderation API with configurable thresholds
export async function moderateContent(text) {
  try {
    const response = await openai.moderations.create({
      input: text
    });

    const result = response.results[0];
    const flaggedCategories = [];
    const categoryActions = {};
    const scores = {};

    // Check each category against configurable thresholds
    for (const category of ALL_CATEGORIES) {
      const categoryKey = category.replace('/', '_');
      const score = result.category_scores[category];
      scores[categoryKey] = score;

      // Get action from rule engine based on threshold
      try {
        const action = await ruleEngine.getModerationAction(category, score);
        if (action.shouldAct) {
          flaggedCategories.push(category);
          categoryActions[category] = action.action;
        }
      } catch (err) {
        // Fallback to OpenAI's built-in flagging
        if (result.categories[category]) {
          flaggedCategories.push(category);
          categoryActions[category] = 'block';
        }
      }
    }

    // Determine overall action
    let shouldBlock = false;
    let shouldEscalate = false;
    let shouldFlag = false;

    for (const category of flaggedCategories) {
      const action = categoryActions[category] || 'block';
      if (action === 'block') shouldBlock = true;
      if (action === 'escalate') shouldEscalate = true;
      if (action === 'flag') shouldFlag = true;
    }

    return {
      flagged: result.flagged || flaggedCategories.length > 0,
      categories: flaggedCategories,
      categoryActions,
      scores,
      shouldBlock,
      shouldEscalate,
      shouldFlag
    };
  } catch (error) {
    logger.error({
      message: 'Moderation API error',
      error: error.message
    });

    // Fail open but log the error
    return {
      flagged: false,
      categories: [],
      categoryActions: {},
      scores: {},
      shouldBlock: false,
      shouldEscalate: false,
      shouldFlag: false,
      error: error.message
    };
  }
}

// Moderate and log result
export async function moderateAndLog(text, messageId = null) {
  const result = await moderateContent(text);

  // Log to database if message ID is provided
  if (messageId) {
    try {
      await logModeration(messageId, result.flagged, result.categories, result.scores);
    } catch (error) {
      logger.error({
        message: 'Failed to log moderation result',
        error: error.message
      });
    }
  }

  return result;
}

// Get safe fallback response for flagged content
export function getModerationFallbackResponse(categories) {
  if (categories.includes('self-harm') ||
      categories.includes('self-harm/intent') ||
      categories.includes('self-harm/instructions')) {
    return {
      message: "I'm concerned about what you've shared. If you're going through a difficult time, please reach out to a crisis helpline. You're not alone, and help is available.",
      resources: [
        { name: "National Suicide Prevention Lifeline", contact: "988" },
        { name: "Crisis Text Line", contact: "Text HOME to 741741" },
        { name: "International Association for Suicide Prevention", contact: "https://www.iasp.info/resources/Crisis_Centres/" }
      ],
      shouldEscalate: true
    };
  }

  return {
    message: "I'm not able to respond to that type of message. If you have a customer support question, I'd be happy to help with that instead.",
    resources: null,
    shouldEscalate: false
  };
}
