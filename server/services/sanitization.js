/**
 * Input Sanitization Service
 *
 * This service provides security-focused input processing to protect against:
 * - Prompt injection attacks (attempts to manipulate AI behavior)
 * - HTML/Script injection (XSS prevention)
 * - Malformed or empty input
 *
 * The service uses a two-tier approach:
 * 1. Dynamic patterns from the rule engine (database-backed, admin-configurable)
 * 2. Hardcoded fallback patterns when the database is unavailable
 *
 * Security Philosophy:
 * - Defense in depth: Multiple layers of checks
 * - Fail-safe: Blocks suspicious content when in doubt
 * - Graceful degradation: Falls back to hardcoded patterns if DB fails
 *
 * @module services/sanitization
 */

import { logger } from '../middleware/errorHandler.js';
import ruleEngine from './ruleEngine.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK PROMPT INJECTION PATTERNS
// These hardcoded patterns are used when the rule engine / database is unavailable.
// They detect common prompt injection techniques used to manipulate AI systems.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fallback regex patterns for detecting prompt injection attempts.
 *
 * Categories of attacks detected:
 * 1. Instruction Override - Attempts to ignore/forget previous instructions
 * 2. Role Manipulation - Attempts to change the AI's persona or role
 * 3. System Prompt Extraction - Attempts to reveal internal prompts
 * 4. Safety Bypass - Attempts to disable safety features
 *
 * Each pattern is case-insensitive to catch variations.
 */
const FALLBACK_INJECTION_PATTERNS = [
  // ─────────────────────────────────────────────────────────────────────────────
  // INSTRUCTION OVERRIDE ATTACKS
  // These patterns attempt to make the AI ignore its original instructions
  // ─────────────────────────────────────────────────────────────────────────────
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|your)\s+(instructions?|prompts?|rules?)/i,
  /forget\s+(all\s+)?(previous|prior|your)\s+(instructions?|prompts?)/i,

  // ─────────────────────────────────────────────────────────────────────────────
  // ROLE MANIPULATION ATTACKS
  // These patterns attempt to change the AI's identity or behavior
  // ─────────────────────────────────────────────────────────────────────────────
  /you\s+are\s+now\s+(a|an|the)/i,          // "You are now a hacker"
  /pretend\s+(you\s+are|to\s+be|you're)/i,  // "Pretend you're evil"
  /act\s+as\s+(if\s+you\s+are|a|an)/i,      // "Act as a different AI"
  /roleplay\s+as/i,                          // "Roleplay as someone else"
  /new\s+persona/i,                          // "Adopt a new persona"

  // ─────────────────────────────────────────────────────────────────────────────
  // SYSTEM PROMPT INJECTION
  // These patterns attempt to inject fake system-level commands
  // ─────────────────────────────────────────────────────────────────────────────
  /system\s*:\s*/i,   // "System: new instructions"
  /\[system\]/i,      // "[SYSTEM] override"
  /\<system\>/i,      // "<system>hack</system>"

  // ─────────────────────────────────────────────────────────────────────────────
  // PROMPT EXTRACTION ATTACKS
  // These patterns attempt to reveal the AI's internal instructions
  // ─────────────────────────────────────────────────────────────────────────────
  /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?)/i,
  /output\s+(your|the)\s+(initial|system)\s+(prompt|instructions?)/i,
  /print\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /repeat\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,

  // ─────────────────────────────────────────────────────────────────────────────
  // SAFETY BYPASS ATTACKS
  // These patterns attempt to disable or circumvent safety measures
  // ─────────────────────────────────────────────────────────────────────────────
  /ignore\s+safety/i,                        // Direct safety override
  /bypass\s+(safety|filters?|restrictions?)/i, // Filter bypass attempts
  /jailbreak/i,                              // Known jailbreak terminology
  /DAN\s*mode/i,                             // "Do Anything Now" attack
  /developer\s*mode/i,                       // Fake developer mode activation
];

/**
 * Regex pattern to match and remove HTML/script tags.
 * This is a simple pattern that matches any angle-bracket enclosed content.
 * Used to prevent XSS attacks and clean up HTML in user input.
 */
const HTML_PATTERN = /<[^>]*>/g;

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT INJECTION DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect prompt injection attempts using the rule engine (async).
 *
 * This is the primary detection method that checks user input against:
 * 1. Dynamic regex patterns from the database (admin-configurable)
 * 2. Blocked keywords list from the database
 *
 * Falls back to hardcoded patterns if the database is unavailable.
 *
 * @param {string} text - User input text to analyze
 * @returns {Promise<Object>} Detection result containing:
 *   - detected {boolean} - Whether an injection attempt was found
 *   - pattern {string|undefined} - The pattern that matched (if detected)
 *   - action {string|undefined} - Recommended action (block, warn, etc.)
 *   - category {string|undefined} - Category of the detected pattern
 *
 * @example
 * const result = await detectPromptInjection("Ignore all previous instructions");
 * // Returns: { detected: true, pattern: "...", action: "block" }
 */
export async function detectPromptInjection(text) {
  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // CHECK DYNAMIC REGEX PATTERNS
    // These patterns are stored in the database and can be updated by admins
    // without requiring code deployment
    // ─────────────────────────────────────────────────────────────────────────────
    const match = await ruleEngine.matchRegexPatterns(text);
    if (match.matched) {
      return {
        detected: true,
        pattern: match.pattern,
        action: match.action,
        category: match.category
      };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CHECK BLOCKED KEYWORDS
    // Simple keyword matching for known malicious terms
    // ─────────────────────────────────────────────────────────────────────────────
    const keywordMatch = await ruleEngine.matchBlockedKeywords(text);
    if (keywordMatch.matched) {
      return {
        detected: true,
        pattern: `keyword:${keywordMatch.keyword}`,
        action: 'block'
      };
    }

    // No injection detected
    return { detected: false };
  } catch (err) {
    // ─────────────────────────────────────────────────────────────────────────────
    // FALLBACK ON ERROR
    // If the rule engine fails (e.g., database unavailable), use hardcoded patterns
    // This ensures security is maintained even during outages
    // ─────────────────────────────────────────────────────────────────────────────
    logger.warn({ message: 'Rule engine failed, using fallback patterns', error: err.message });
    return detectPromptInjectionFallback(text);
  }
}

/**
 * Synchronous fallback detection using hardcoded patterns.
 *
 * This function is used when the rule engine (database) is unavailable.
 * It checks against the FALLBACK_INJECTION_PATTERNS array defined above.
 *
 * @param {string} text - User input text to analyze
 * @returns {Object} Detection result containing:
 *   - detected {boolean} - Whether an injection attempt was found
 *   - pattern {string|undefined} - String representation of matching pattern
 * @private
 */
function detectPromptInjectionFallback(text) {
  // Iterate through all fallback patterns and return on first match
  for (const pattern of FALLBACK_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        pattern: pattern.toString()  // Convert regex to string for logging
      };
    }
  }
  return { detected: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT CLEANING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Remove all HTML and script tags from text.
 *
 * This is a security measure to prevent:
 * - XSS (Cross-Site Scripting) attacks
 * - HTML injection in chat displays
 * - Malformed content from breaking the UI
 *
 * @param {string} text - Input text potentially containing HTML
 * @returns {string} Cleaned text with all HTML tags removed
 *
 * @example
 * stripHtmlTags("<script>alert('xss')</script>Hello")
 * // Returns: "alert('xss')Hello"
 */
export function stripHtmlTags(text) {
  return text.replace(HTML_PATTERN, '');
}

/**
 * Normalize whitespace in text.
 *
 * Performs two operations:
 * 1. Collapses multiple consecutive whitespace characters into single spaces
 * 2. Trims leading and trailing whitespace
 *
 * This helps with:
 * - Consistent text processing
 * - Reducing storage overhead
 * - Preventing whitespace-based obfuscation attacks
 *
 * @param {string} text - Input text with potentially irregular whitespace
 * @returns {string} Text with normalized whitespace
 *
 * @example
 * normalizeWhitespace("  Hello   world  \n\t  ")
 * // Returns: "Hello world"
 */
export function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SANITIZATION PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main sanitization function - processes user input through all security checks.
 *
 * This function orchestrates the complete input sanitization pipeline:
 * 1. Prompt injection detection (blocks if detected)
 * 2. HTML tag removal (cleans but doesn't block)
 * 3. Whitespace normalization (cleans but doesn't block)
 * 4. Empty content check (blocks if empty after cleaning)
 *
 * @param {string} text - Raw user input to sanitize
 * @returns {Promise<Object>} Sanitization result containing:
 *   - original {string} - The original input text
 *   - sanitized {string} - The cleaned version of the text
 *   - blocked {boolean} - Whether the input should be rejected
 *   - blockReason {string|null} - Machine-readable reason for blocking
 *   - action {string|undefined} - Action to take (from rule engine)
 *   - warnings {Array<string>} - List of modifications made (e.g., HTML removed)
 *
 * @example
 * // Clean input passes through
 * const result = await sanitizeInput("Hello, I need help");
 * // { blocked: false, sanitized: "Hello, I need help", warnings: [] }
 *
 * @example
 * // Injection attempt is blocked
 * const result = await sanitizeInput("Ignore previous instructions");
 * // { blocked: true, blockReason: "PROMPT_INJECTION_DETECTED" }
 */
export async function sanitizeInput(text) {
  // Initialize result object to track all sanitization outcomes
  const result = {
    original: text,      // Preserve original for logging/debugging
    sanitized: text,     // Will be updated as we clean the text
    blocked: false,      // Assume safe until proven otherwise
    blockReason: null,   // Will be set if blocking occurs
    warnings: []         // Track non-blocking modifications
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: PROMPT INJECTION CHECK
  // This is the first and most critical security check.
  // If injection is detected, we block immediately - no further processing.
  // ─────────────────────────────────────────────────────────────────────────────
  const injectionCheck = await detectPromptInjection(text);
  if (injectionCheck.detected) {
    result.blocked = true;
    result.blockReason = 'PROMPT_INJECTION_DETECTED';
    result.action = injectionCheck.action || 'block';

    // Log the detection for security monitoring and rule tuning
    logger.warn({
      message: 'Prompt injection detected',
      pattern: injectionCheck.pattern,
      category: injectionCheck.category,
      input: text.substring(0, 100)  // Only log first 100 chars for privacy
    });

    return result;  // Early return - don't process blocked content
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: HTML TAG REMOVAL
  // Strip out any HTML/script tags to prevent XSS and display issues.
  // This is a non-blocking operation - we just clean and continue.
  // ─────────────────────────────────────────────────────────────────────────────
  let sanitized = stripHtmlTags(text);
  if (sanitized !== text) {
    // Track that HTML was removed (useful for debugging and analytics)
    result.warnings.push('HTML_TAGS_REMOVED');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3: WHITESPACE NORMALIZATION
  // Clean up irregular whitespace for consistent processing.
  // ─────────────────────────────────────────────────────────────────────────────
  sanitized = normalizeWhitespace(sanitized);

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 4: EMPTY CONTENT CHECK
  // After all cleaning, verify there's still meaningful content.
  // Messages that are only HTML/whitespace get blocked.
  // ─────────────────────────────────────────────────────────────────────────────
  if (sanitized.length === 0) {
    result.blocked = true;
    result.blockReason = 'EMPTY_AFTER_SANITIZATION';
    return result;
  }

  // All checks passed - return the sanitized text
  result.sanitized = sanitized;
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER-FACING RESPONSE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a user-friendly response for blocked input.
 *
 * This function provides contextually appropriate messages when input is blocked.
 * The messages are:
 * - Non-accusatory (don't assume malicious intent)
 * - Helpful (suggest how to proceed)
 * - Vague about specifics (don't reveal detection methods)
 *
 * @param {string} reason - The block reason code from sanitization
 * @returns {string} A user-friendly message explaining the block
 *
 * @example
 * getBlockedInputResponse('PROMPT_INJECTION_DETECTED')
 * // "I noticed your message contains patterns that I cannot process..."
 */
export function getBlockedInputResponse(reason) {
  switch (reason) {
    case 'PROMPT_INJECTION_DETECTED':
      // Vague message that doesn't reveal what patterns triggered detection
      // This prevents attackers from learning to evade our filters
      return "I noticed your message contains patterns that I cannot process. Could you please rephrase your question in a different way?";

    case 'EMPTY_AFTER_SANITIZATION':
      // Direct and helpful message for empty content
      return "Your message appears to be empty. Please try again with a valid question.";

    default:
      // Generic fallback for any other block reasons
      return "I couldn't process your message. Please try rephrasing your question.";
  }
}
