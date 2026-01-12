/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Escalation Detection Service
 *
 * This service analyzes user messages to detect situations that require
 * human intervention. It identifies crisis situations, legal concerns,
 * complaints, and extreme negative sentiment.
 *
 * Escalation Categories (in priority order):
 * 1. CRISIS (Critical): Suicidal ideation, self-harm - immediate intervention needed
 * 2. LEGAL (High): Legal threats, lawsuit mentions - requires legal team review
 * 3. COMPLAINT (Medium): Manager requests, complaints - customer service escalation
 * 4. SENTIMENT (Medium): Extremely negative sentiment - proactive outreach
 *
 * The service uses two detection methods:
 * - Async: Uses database-backed rules from the rule engine (preferred)
 * - Sync Fallback: Uses hardcoded regex patterns if database unavailable
 *
 * @module services/escalation
 */

import { logger } from '../middleware/errorHandler.js';
import { updateEscalation } from '../db/conversations.js';
import ruleEngine from './ruleEngine.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK REGEX PATTERNS
// These patterns are used when the rule engine / database is unavailable.
// They provide baseline escalation detection even during database outages.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crisis keywords requiring IMMEDIATE attention.
 * These patterns detect suicidal ideation and self-harm discussions.
 * Triggers CRITICAL urgency escalation.
 */
const FALLBACK_CRISIS_KEYWORDS = [
  // Suicidal ideation patterns
  /\b(suicid|kill\s*(myself|me)|end\s*(my|it\s*all)|take\s*my\s*(own\s*)?life)\b/i,
  // Self-harm patterns
  /\b(self[- ]?harm|cut(ting)?\s*(myself|me)|hurt(ing)?\s*(myself|me))\b/i,
  // Death wish expressions
  /\b(want\s*to\s*die|don'?t\s*want\s*to\s*live|better\s*off\s*dead)\b/i,
  // Overdose references
  /\b(overdose|od\s*on|pills\s*to\s*(end|die))\b/i
];

/**
 * Legal concern keywords that trigger HIGH urgency escalation.
 * These indicate the user may be considering legal action.
 */
const FALLBACK_LEGAL_KEYWORDS = [
  /\b(lawyer|attorney|legal\s*(action|counsel|team))\b/i,
  /\b(lawsuit|sue|suing|litigation|court)\b/i,
  /\b(class\s*action|legal\s*proceedings)\b/i
];

/**
 * Complaint/escalation request keywords - MEDIUM urgency.
 * These indicate the user wants to speak with a human or file a complaint.
 */
const FALLBACK_COMPLAINT_KEYWORDS = [
  // Direct human handoff requests
  /\b(speak\s*(to|with)\s*(a\s*)?(manager|supervisor|human|person|agent))\b/i,
  // Escalation and complaint terms
  /\b(escalate|escalation|complaint|complain)\b/i,
  // Reporting intentions
  /\b(report\s*(this|you)|file\s*a\s*complaint)\b/i,
  // Strong dissatisfaction
  /\b(unacceptable|outrageous|ridiculous|terrible\s*service)\b/i,
  // External escalation threats
  /\b(bbb|better\s*business\s*bureau|consumer\s*protection)\b/i
];

/**
 * Refund-related patterns that may indicate escalation potential.
 * These are tracked but don't automatically trigger escalation.
 */
const FALLBACK_REFUND_PATTERNS = [
  /\b(refund|money\s*back|charge\s*back|chargeback)\b/i,
  /\b(stolen|fraud|scam|rip\s*off|ripoff)\b/i
];

/**
 * Negative sentiment indicators - MEDIUM urgency when multiple match.
 * A single negative word doesn't trigger escalation, but 2+ does.
 */
const FALLBACK_NEGATIVE_SENTIMENT_KEYWORDS = [
  // Strong anger expressions
  /\b(angry|furious|livid|outraged|disgusted)\b/i,
  // Extreme negative descriptors
  /\b(worst|terrible|horrible|awful|pathetic)\b/i,
  // Hatred expressions
  /\b(hate|despise|loathe)\b/i,
  // Intent to leave/discourage others
  /\b(never\s*(again|buying|using|recommending))\b/i,
  // Value complaint
  /\b(waste\s*of\s*(time|money))\b/i
];

/**
 * Configuration for each escalation category.
 * - urgency: How quickly this needs human attention
 * - priority: Numeric priority for sorting (higher = more urgent)
 */
const CATEGORY_CONFIG = {
  crisis: { urgency: 'critical', priority: 100 },  // Immediate attention
  legal: { urgency: 'high', priority: 80 },        // Same-day response
  complaint: { urgency: 'medium', priority: 60 },  // 24-hour response
  sentiment: { urgency: 'medium', priority: 40 }   // Proactive outreach
};

// ═══════════════════════════════════════════════════════════════════════════════
// ESCALATION ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze text for escalation triggers using the rule engine (async).
 *
 * This is the preferred method that uses database-backed rules, allowing
 * administrators to update escalation keywords without code changes.
 * Falls back to sync analysis if the rule engine is unavailable.
 *
 * @param {string} text - User message to analyze
 * @returns {Promise<Object>} Escalation result:
 *   - shouldEscalate {boolean} - Whether escalation is needed
 *   - reason {string|null} - Machine-readable reason code
 *   - type {string|null} - Escalation category (crisis, legal, etc.)
 *   - urgency {string} - Urgency level (critical, high, medium, normal)
 *   - triggers {Array} - List of triggered patterns
 */
export async function analyzeEscalationAsync(text) {
  // Initialize result with safe defaults
  const result = {
    shouldEscalate: false,
    reason: null,
    type: null,
    urgency: 'normal',
    triggers: []
  };

  try {
    // Use rule engine for dynamic keywords (admin-configurable)
    const matches = await ruleEngine.matchEscalationKeywords(text);

    if (matches.matched) {
      // Group matches by category to determine which categories triggered
      const categoryMatches = {};
      for (const match of matches.matches) {
        if (!categoryMatches[match.category]) {
          categoryMatches[match.category] = [];
        }
        categoryMatches[match.category].push(match.keyword);
      }

      // Find the highest priority category among matches
      // This determines the escalation type and urgency
      let highestPriority = -1;
      let topCategory = null;

      for (const category of Object.keys(categoryMatches)) {
        const config = CATEGORY_CONFIG[category] || { urgency: 'medium', priority: 50 };
        if (config.priority > highestPriority) {
          highestPriority = config.priority;
          topCategory = category;
        }
        result.triggers.push(`${category}_keyword`);
      }

      // Set escalation details based on highest priority category
      if (topCategory) {
        const config = CATEGORY_CONFIG[topCategory] || { urgency: 'medium' };
        result.shouldEscalate = true;
        result.type = topCategory;
        result.urgency = config.urgency;

        // Map category to machine-readable reason code
        switch (topCategory) {
          case 'crisis':
            result.reason = 'CRISIS_DETECTED';
            break;
          case 'legal':
            result.reason = 'LEGAL_CONCERN';
            break;
          case 'complaint':
            result.reason = 'ESCALATION_REQUESTED';
            break;
          case 'sentiment':
            result.reason = 'NEGATIVE_SENTIMENT';
            break;
          default:
            result.reason = 'ESCALATION_TRIGGERED';
        }
      }
    }

    return result;
  } catch (err) {
    // Rule engine failed - fall back to hardcoded patterns
    logger.warn({ message: 'Rule engine failed for escalation, using fallback', error: err.message });
    return analyzeEscalation(text);
  }
}

/**
 * Synchronous escalation analysis using hardcoded patterns.
 *
 * This is the fallback method used when:
 * - The rule engine / database is unavailable
 * - Called directly from the sync pipeline code
 *
 * Checks patterns in priority order and returns immediately on crisis detection.
 *
 * @param {string} text - User message to analyze
 * @returns {Object} Escalation result (same structure as async version)
 */
export function analyzeEscalation(text) {
  const result = {
    shouldEscalate: false,
    reason: null,
    type: null,
    urgency: 'normal',
    triggers: []
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIORITY 1: CRISIS DETECTION (CRITICAL URGENCY)
  // Check first and return immediately if found - crisis takes precedence.
  // ─────────────────────────────────────────────────────────────────────────────
  for (const pattern of FALLBACK_CRISIS_KEYWORDS) {
    if (pattern.test(text)) {
      result.shouldEscalate = true;
      result.reason = 'CRISIS_DETECTED';
      result.type = 'crisis';
      result.urgency = 'critical';
      result.triggers.push('crisis_keyword');
      return result;  // Immediate return - nothing is higher priority
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIORITY 2: LEGAL CONCERNS (HIGH URGENCY)
  // ─────────────────────────────────────────────────────────────────────────────
  for (const pattern of FALLBACK_LEGAL_KEYWORDS) {
    if (pattern.test(text)) {
      result.triggers.push('legal_keyword');
      // Only set if no higher priority escalation already triggered
      if (!result.shouldEscalate) {
        result.shouldEscalate = true;
        result.reason = 'LEGAL_CONCERN';
        result.type = 'legal';
        result.urgency = 'high';
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIORITY 3: COMPLAINT / HUMAN HANDOFF REQUESTS (MEDIUM URGENCY)
  // ─────────────────────────────────────────────────────────────────────────────
  for (const pattern of FALLBACK_COMPLAINT_KEYWORDS) {
    if (pattern.test(text)) {
      result.triggers.push('complaint_keyword');
      if (!result.shouldEscalate) {
        result.shouldEscalate = true;
        result.reason = 'ESCALATION_REQUESTED';
        result.type = 'complaint';
        result.urgency = 'medium';
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TRACK REFUND PATTERNS (informational, doesn't trigger escalation alone)
  // ─────────────────────────────────────────────────────────────────────────────
  for (const pattern of FALLBACK_REFUND_PATTERNS) {
    if (pattern.test(text)) {
      result.triggers.push('refund_keyword');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIORITY 4: NEGATIVE SENTIMENT ANALYSIS (MEDIUM URGENCY)
  // Requires 2+ negative indicators to trigger (avoids false positives)
  // ─────────────────────────────────────────────────────────────────────────────
  let negativeSentimentCount = 0;
  for (const pattern of FALLBACK_NEGATIVE_SENTIMENT_KEYWORDS) {
    if (pattern.test(text)) {
      negativeSentimentCount++;
      result.triggers.push('negative_sentiment');
    }
  }

  // Only escalate on sentiment if multiple negative indicators present
  // and no higher priority escalation already triggered
  if (negativeSentimentCount >= 2 && !result.shouldEscalate) {
    result.shouldEscalate = true;
    result.reason = 'NEGATIVE_SENTIMENT';
    result.type = 'sentiment';
    result.urgency = 'medium';
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESCALATION HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mark a conversation as escalated in the database.
 *
 * This function persists the escalation status so it appears in the
 * admin dashboard for human review. Called by the safety pipeline
 * when escalation is triggered.
 *
 * @param {string} conversationId - UUID of the conversation to escalate
 * @param {Object} escalationResult - Result from analyzeEscalation/analyzeEscalationAsync
 * @returns {Promise<boolean>} True if escalation was recorded successfully
 */
export async function handleEscalation(conversationId, escalationResult) {
  try {
    await updateEscalation(conversationId, escalationResult.reason);

    logger.info({
      message: 'Conversation escalated',
      conversationId,
      reason: escalationResult.reason,
      type: escalationResult.type,
      urgency: escalationResult.urgency
    });

    return true;
  } catch (error) {
    logger.error({
      message: 'Failed to escalate conversation',
      error: error.message,
      conversationId
    });
    return false;
  }
}

// Get escalation response based on type
export function getEscalationResponse(type) {
  switch (type) {
    case 'crisis':
      return {
        message: "I'm very concerned about what you've shared. Your wellbeing is important. Please reach out to a crisis helpline - they're available 24/7 and want to help.",
        resources: [
          { name: "National Suicide Prevention Lifeline", contact: "988 (call or text)" },
          { name: "Crisis Text Line", contact: "Text HOME to 741741" },
          { name: "International Association for Suicide Prevention", url: "https://www.iasp.info/resources/Crisis_Centres/" }
        ],
        showHumanHandoff: false // Crisis resources are priority
      };

    case 'threat':
      return {
        message: "I'm not able to assist with that request. This conversation has been flagged for review by our team. If you're experiencing a difficult situation, please consider reaching out to local authorities or appropriate support services.",
        resources: null,
        showHumanHandoff: true
      };

    case 'moderation':
      return {
        message: "I'm not able to respond to that type of message. This conversation has been flagged for review. If you have a customer support question, I'd be happy to help with that instead.",
        resources: null,
        showHumanHandoff: true
      };

    case 'legal':
      return {
        message: "I understand you have legal concerns. I'm going to connect you with a member of our team who can better assist with this matter. A representative will review your conversation and reach out shortly.",
        resources: null,
        showHumanHandoff: true
      };

    case 'complaint':
      return {
        message: "I understand you'd like to speak with someone from our team. I've flagged this conversation for review, and a human agent will follow up with you. Is there anything else I can help you with in the meantime?",
        resources: null,
        showHumanHandoff: true
      };

    case 'sentiment':
      return {
        message: "I can see you're frustrated, and I'm sorry for any inconvenience. I've noted your concerns and flagged this for follow-up by our team. Would you like me to continue trying to help, or would you prefer to wait for a human agent?",
        resources: null,
        showHumanHandoff: true
      };

    default:
      return {
        message: "I've noted your concerns and flagged this conversation for review by our team.",
        resources: null,
        showHumanHandoff: true
      };
  }
}
