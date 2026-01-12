/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Content Moderation Service
 *
 * This service integrates with OpenAI's Moderation API to detect harmful content
 * across 13 different categories. It uses configurable thresholds from the
 * rule engine to determine whether content should be blocked, flagged, or escalated.
 *
 * Key Features:
 * - Real-time content moderation using OpenAI's trained models
 * - Configurable thresholds per category (via admin dashboard)
 * - Category-specific fallback responses with appropriate resources
 * - Fail-open design: if moderation API fails, content passes through with logging
 *
 * Categories Checked:
 * - Hate speech (including threatening)
 * - Harassment (including threatening)
 * - Self-harm (including intent and instructions)
 * - Sexual content (including minors)
 * - Violence (including graphic)
 * - Illicit content (including violent)
 *
 * @module services/moderation
 */

import OpenAI from 'openai';
import { logger } from '../middleware/errorHandler.js';
import { logModeration } from '../db/moderationLogs.js';
import ruleEngine from './ruleEngine.js';

// Initialize OpenAI client with API key from environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * All moderation categories supported by OpenAI's Moderation API.
 * Used as fallback when rule engine is unavailable.
 */
const ALL_CATEGORIES = [
  'hate',                    // Content that expresses hatred toward a group
  'hate/threatening',        // Hateful content with intent to harm
  'harassment',              // Content that harasses an individual
  'harassment/threatening',  // Harassment with intent to harm
  'self-harm',              // Content about self-harm
  'self-harm/intent',       // Expression of intent to self-harm
  'self-harm/instructions', // Instructions for self-harm
  'sexual',                 // Sexually explicit content
  'sexual/minors',          // Sexual content involving minors
  'violence',               // Violent content
  'violence/graphic',       // Graphic violence
  'illicit',                // Illegal activity
  'illicit/violent'         // Violent illegal activity
];

/**
 * Check content against OpenAI's Moderation API.
 *
 * This function sends text to OpenAI for analysis and compares the returned
 * scores against configurable thresholds. Different actions can be configured
 * per category (block, flag, escalate, warn).
 *
 * @param {string} text - Content to moderate
 * @returns {Promise<Object>} Moderation result:
 *   - flagged {boolean} - Whether any category was flagged
 *   - categories {Array} - List of flagged category names
 *   - categoryActions {Object} - Map of category -> action
 *   - scores {Object} - Raw scores from OpenAI (0-1) per category
 *   - shouldBlock {boolean} - True if any 'block' action triggered
 *   - shouldEscalate {boolean} - True if any 'escalate' action triggered
 *   - shouldFlag {boolean} - True if any 'flag' action triggered
 *   - error {string|undefined} - Error message if API call failed
 */
export async function moderateContent(text) {
  try {
    // Call OpenAI Moderation API
    const response = await openai.moderations.create({
      input: text
    });

    const result = response.results[0];
    const flaggedCategories = [];   // Categories that exceeded thresholds
    const categoryActions = {};      // Action to take per category
    const scores = {};               // Raw scores for logging

    // Check each category against our configurable thresholds
    // (thresholds are managed via admin dashboard)
    for (const category of ALL_CATEGORIES) {
      // Convert category name for use as object key (/ → _)
      const categoryKey = category.replace('/', '_');
      const score = result.category_scores[category];
      scores[categoryKey] = score;

      // Use rule engine to determine action based on threshold
      try {
        const action = await ruleEngine.getModerationAction(category, score);
        if (action.shouldAct) {
          flaggedCategories.push(category);
          categoryActions[category] = action.action;
        }
      } catch (err) {
        // Rule engine unavailable - fall back to OpenAI's built-in flagging
        if (result.categories[category]) {
          flaggedCategories.push(category);
          categoryActions[category] = 'block';
        }
      }
    }

    // Aggregate actions across all flagged categories
    // Priority: block > escalate > flag
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
    // Log the error but FAIL OPEN (allow content through)
    // This prevents a moderation API outage from blocking all messages
    logger.error({
      message: 'Moderation API error',
      error: error.message
    });

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

/**
 * Moderate content and persist the result to the database.
 * Used when we want to maintain a log of moderation decisions.
 *
 * @param {string} text - Content to moderate
 * @param {string|null} messageId - Optional message ID to associate with log
 * @returns {Promise<Object>} Moderation result (same as moderateContent)
 */
export async function moderateAndLog(text, messageId = null) {
  const result = await moderateContent(text);

  // Persist moderation result to database for analytics and audit trail
  if (messageId) {
    try {
      await logModeration(messageId, result.flagged, result.categories, result.scores);
    } catch (error) {
      // Don't fail the request if logging fails
      logger.error({
        message: 'Failed to log moderation result',
        error: error.message
      });
    }
  }

  return result;
}

/**
 * Generate an appropriate fallback response for flagged content.
 *
 * This function examines which moderation categories were triggered and
 * returns a contextually appropriate response. Different categories get
 * different responses:
 *
 * - Self-harm: Empathetic response with crisis resources
 * - Violence/Threats: Firm but helpful redirection
 * - Other (sexual, harassment, hate): Generic redirect to safe topics
 *
 * @param {Array<string>} categories - List of flagged moderation categories
 * @returns {Object} Fallback response containing:
 *   - message {string} - The response text to show the user
 *   - resources {Array|null} - Crisis resources if applicable
 *   - shouldEscalate {boolean} - Whether to escalate to human review
 *   - escalationType {string} - Type of escalation (crisis, threat, moderation)
 */
export function getModerationFallbackResponse(categories) {
  // ─────────────────────────────────────────────────────────────────────────────
  // SELF-HARM DETECTION
  // Highest priority - provide immediate crisis resources.
  // This is a duty-of-care response that takes precedence over other categories.
  // ─────────────────────────────────────────────────────────────────────────────
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
      shouldEscalate: true,
      escalationType: 'crisis'
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIOLENCE, THREATS, AND ILLICIT CONTENT
  // These require human review and a firm but non-confrontational response.
  // ─────────────────────────────────────────────────────────────────────────────
  if (categories.includes('violence') ||
      categories.includes('violence/graphic') ||
      categories.includes('harassment/threatening') ||
      categories.includes('hate/threatening') ||
      categories.includes('illicit') ||
      categories.includes('illicit/violent')) {
    return {
      message: "I'm really sorry, but I can't assist with that. It's important to handle disagreements or conflicts peacefully. If you're in a difficult situation, I would highly recommend seeking help from local authorities or professionals who can offer the right support and guidance. Is there anything else, perhaps more within my capacity, that I can help you with?",
      resources: null,
      shouldEscalate: true,
      escalationType: 'threat'
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OTHER FLAGGED CONTENT
  // Includes sexual content, general harassment, hate speech without threats.
  // Generic redirect to appropriate topics.
  // ─────────────────────────────────────────────────────────────────────────────
  if (categories.length > 0) {
    return {
      message: "I'm not able to respond to that type of message. If you have a customer support question, I'd be happy to help with that instead.",
      resources: null,
      shouldEscalate: true,
      escalationType: 'moderation'
    };
  }

  // Default fallback (shouldn't normally reach here)
  return {
    message: "I'm not able to respond to that type of message. If you have a customer support question, I'd be happy to help with that instead.",
    resources: null,
    shouldEscalate: false
  };
}
