import { logger } from '../middleware/errorHandler.js';
import { updateEscalation } from '../db/conversations.js';
import ruleEngine from './ruleEngine.js';

// Fallback crisis keywords that require immediate attention
const FALLBACK_CRISIS_KEYWORDS = [
  /\b(suicid|kill\s*(myself|me)|end\s*(my|it\s*all)|take\s*my\s*(own\s*)?life)\b/i,
  /\b(self[- ]?harm|cut(ting)?\s*(myself|me)|hurt(ing)?\s*(myself|me))\b/i,
  /\b(want\s*to\s*die|don'?t\s*want\s*to\s*live|better\s*off\s*dead)\b/i,
  /\b(overdose|od\s*on|pills\s*to\s*(end|die))\b/i
];

// Fallback legal/escalation keywords
const FALLBACK_LEGAL_KEYWORDS = [
  /\b(lawyer|attorney|legal\s*(action|counsel|team))\b/i,
  /\b(lawsuit|sue|suing|litigation|court)\b/i,
  /\b(class\s*action|legal\s*proceedings)\b/i
];

// Fallback complaint/escalation keywords
const FALLBACK_COMPLAINT_KEYWORDS = [
  /\b(speak\s*(to|with)\s*(a\s*)?(manager|supervisor|human|person|agent))\b/i,
  /\b(escalate|escalation|complaint|complain)\b/i,
  /\b(report\s*(this|you)|file\s*a\s*complaint)\b/i,
  /\b(unacceptable|outrageous|ridiculous|terrible\s*service)\b/i,
  /\b(bbb|better\s*business\s*bureau|consumer\s*protection)\b/i
];

// Fallback refund/money keywords with negative context
const FALLBACK_REFUND_PATTERNS = [
  /\b(refund|money\s*back|charge\s*back|chargeback)\b/i,
  /\b(stolen|fraud|scam|rip\s*off|ripoff)\b/i
];

// Fallback negative sentiment indicators (simple keyword-based)
const FALLBACK_NEGATIVE_SENTIMENT_KEYWORDS = [
  /\b(angry|furious|livid|outraged|disgusted)\b/i,
  /\b(worst|terrible|horrible|awful|pathetic)\b/i,
  /\b(hate|despise|loathe)\b/i,
  /\b(never\s*(again|buying|using|recommending))\b/i,
  /\b(waste\s*of\s*(time|money))\b/i
];

// Priority and urgency mapping for categories
const CATEGORY_CONFIG = {
  crisis: { urgency: 'critical', priority: 100 },
  legal: { urgency: 'high', priority: 80 },
  complaint: { urgency: 'medium', priority: 60 },
  sentiment: { urgency: 'medium', priority: 40 }
};

// Analyze text for escalation triggers using rule engine
export async function analyzeEscalationAsync(text) {
  const result = {
    shouldEscalate: false,
    reason: null,
    type: null,
    urgency: 'normal',
    triggers: []
  };

  try {
    // Use rule engine for dynamic keywords
    const matches = await ruleEngine.matchEscalationKeywords(text);

    if (matches.matched) {
      // Group by category and find highest priority
      const categoryMatches = {};
      for (const match of matches.matches) {
        if (!categoryMatches[match.category]) {
          categoryMatches[match.category] = [];
        }
        categoryMatches[match.category].push(match.keyword);
      }

      // Find highest priority category
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

      if (topCategory) {
        const config = CATEGORY_CONFIG[topCategory] || { urgency: 'medium' };
        result.shouldEscalate = true;
        result.type = topCategory;
        result.urgency = config.urgency;

        // Set reason based on type
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
    logger.warn({ message: 'Rule engine failed for escalation, using fallback', error: err.message });
    // Fall back to synchronous analysis
    return analyzeEscalation(text);
  }
}

// Synchronous fallback analyze function (original implementation)
export function analyzeEscalation(text) {
  const result = {
    shouldEscalate: false,
    reason: null,
    type: null,
    urgency: 'normal',
    triggers: []
  };

  // Check for crisis keywords (highest priority)
  for (const pattern of FALLBACK_CRISIS_KEYWORDS) {
    if (pattern.test(text)) {
      result.shouldEscalate = true;
      result.reason = 'CRISIS_DETECTED';
      result.type = 'crisis';
      result.urgency = 'critical';
      result.triggers.push('crisis_keyword');
      return result; // Return immediately for crisis
    }
  }

  // Check for legal keywords
  for (const pattern of FALLBACK_LEGAL_KEYWORDS) {
    if (pattern.test(text)) {
      result.triggers.push('legal_keyword');
      if (!result.shouldEscalate) {
        result.shouldEscalate = true;
        result.reason = 'LEGAL_CONCERN';
        result.type = 'legal';
        result.urgency = 'high';
      }
    }
  }

  // Check for complaint/escalation requests
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

  // Check for refund patterns
  for (const pattern of FALLBACK_REFUND_PATTERNS) {
    if (pattern.test(text)) {
      result.triggers.push('refund_keyword');
    }
  }

  // Check sentiment
  let negativeSentimentCount = 0;
  for (const pattern of FALLBACK_NEGATIVE_SENTIMENT_KEYWORDS) {
    if (pattern.test(text)) {
      negativeSentimentCount++;
      result.triggers.push('negative_sentiment');
    }
  }

  // Escalate if highly negative sentiment
  if (negativeSentimentCount >= 2 && !result.shouldEscalate) {
    result.shouldEscalate = true;
    result.reason = 'NEGATIVE_SENTIMENT';
    result.type = 'sentiment';
    result.urgency = 'medium';
  }

  return result;
}

// Handle escalation for a conversation
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
