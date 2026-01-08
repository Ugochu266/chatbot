import { logger } from '../middleware/errorHandler.js';
import ruleEngine from './ruleEngine.js';

// Fallback prompt injection patterns (used when rule engine fails)
const FALLBACK_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|your)\s+(instructions?|prompts?|rules?)/i,
  /forget\s+(all\s+)?(previous|prior|your)\s+(instructions?|prompts?)/i,
  /you\s+are\s+now\s+(a|an|the)/i,
  /pretend\s+(you\s+are|to\s+be|you're)/i,
  /act\s+as\s+(if\s+you\s+are|a|an)/i,
  /roleplay\s+as/i,
  /new\s+persona/i,
  /system\s*:\s*/i,
  /\[system\]/i,
  /\<system\>/i,
  /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?)/i,
  /output\s+(your|the)\s+(initial|system)\s+(prompt|instructions?)/i,
  /print\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /repeat\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /ignore\s+safety/i,
  /bypass\s+(safety|filters?|restrictions?)/i,
  /jailbreak/i,
  /DAN\s*mode/i,
  /developer\s*mode/i,
];

// HTML/Script tag pattern
const HTML_PATTERN = /<[^>]*>/g;

// Check for prompt injection attempts using rule engine
export async function detectPromptInjection(text) {
  try {
    // Use rule engine for dynamic patterns
    const match = await ruleEngine.matchRegexPatterns(text);
    if (match.matched) {
      return {
        detected: true,
        pattern: match.pattern,
        action: match.action,
        category: match.category
      };
    }

    // Also check blocked keywords
    const keywordMatch = await ruleEngine.matchBlockedKeywords(text);
    if (keywordMatch.matched) {
      return {
        detected: true,
        pattern: `keyword:${keywordMatch.keyword}`,
        action: 'block'
      };
    }

    return { detected: false };
  } catch (err) {
    logger.warn({ message: 'Rule engine failed, using fallback patterns', error: err.message });
    // Fall back to hardcoded patterns
    return detectPromptInjectionFallback(text);
  }
}

// Synchronous fallback for when rule engine is unavailable
function detectPromptInjectionFallback(text) {
  for (const pattern of FALLBACK_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        pattern: pattern.toString()
      };
    }
  }
  return { detected: false };
}

// Strip HTML and script tags
export function stripHtmlTags(text) {
  return text.replace(HTML_PATTERN, '');
}

// Normalize whitespace
export function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Main sanitization function
export async function sanitizeInput(text) {
  const result = {
    original: text,
    sanitized: text,
    blocked: false,
    blockReason: null,
    warnings: []
  };

  // Step 1: Check for prompt injection
  const injectionCheck = await detectPromptInjection(text);
  if (injectionCheck.detected) {
    result.blocked = true;
    result.blockReason = 'PROMPT_INJECTION_DETECTED';
    result.action = injectionCheck.action || 'block';
    logger.warn({
      message: 'Prompt injection detected',
      pattern: injectionCheck.pattern,
      category: injectionCheck.category,
      input: text.substring(0, 100)
    });
    return result;
  }

  // Step 2: Strip HTML tags
  let sanitized = stripHtmlTags(text);
  if (sanitized !== text) {
    result.warnings.push('HTML_TAGS_REMOVED');
  }

  // Step 3: Normalize whitespace
  sanitized = normalizeWhitespace(sanitized);

  // Step 4: Check if content is empty after sanitization
  if (sanitized.length === 0) {
    result.blocked = true;
    result.blockReason = 'EMPTY_AFTER_SANITIZATION';
    return result;
  }

  result.sanitized = sanitized;
  return result;
}

// Get safe fallback response for blocked input
export function getBlockedInputResponse(reason) {
  switch (reason) {
    case 'PROMPT_INJECTION_DETECTED':
      return "I noticed your message contains patterns that I cannot process. Could you please rephrase your question in a different way?";
    case 'EMPTY_AFTER_SANITIZATION':
      return "Your message appears to be empty. Please try again with a valid question.";
    default:
      return "I couldn't process your message. Please try rephrasing your question.";
  }
}
