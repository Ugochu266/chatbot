/**
 * Safety Pipeline Service
 *
 * This is the main orchestration layer for all safety checks in SafeChat.
 * It coordinates multiple safety services to ensure user input is safe before
 * processing and AI responses are appropriate before sending to users.
 *
 * The pipeline follows a multi-stage approach:
 * 1. Input Processing: Sanitization → Moderation → Escalation Detection
 * 2. Context Retrieval: RAG system fetches relevant knowledge base documents
 * 3. Output Processing: Validates AI responses before delivery
 *
 * @module services/pipeline
 */

import { sanitizeInput, getBlockedInputResponse } from './sanitization.js';
import { moderateContent, getModerationFallbackResponse } from './moderation.js';
import { retrieveContext } from './rag.js';
import { analyzeEscalation, getEscalationResponse, handleEscalation } from './escalation.js';
import { logger } from '../middleware/errorHandler.js';

/**
 * Process user input through the safety pipeline.
 *
 * This function runs the input through three sequential safety checks:
 * 1. Sanitization - Removes HTML, detects prompt injection attempts
 * 2. Moderation - Uses OpenAI's moderation API to check for harmful content
 * 3. Escalation - Detects crisis situations, legal concerns, or complaints
 *
 * If any check fails, the pipeline returns early with an appropriate fallback
 * response and blocks the message from further processing.
 *
 * @param {string} text - The raw user input text to process
 * @returns {Promise<Object>} Pipeline result containing:
 *   - passed {boolean} - Whether input passed all safety checks
 *   - sanitizedText {string} - The cleaned/sanitized version of input
 *   - blocked {boolean} - Whether the input was blocked
 *   - blockReason {string|null} - Reason for blocking if applicable
 *   - response {string|null} - Fallback response if blocked
 *   - escalation {Object|null} - Escalation details if triggered
 *   - moderation {Object|null} - Moderation API results
 */
export async function processInput(text) {
  // Initialize result object with safe defaults
  // This object accumulates data from each pipeline stage
  const pipelineResult = {
    passed: true,           // Assume safe until proven otherwise
    sanitizedText: text,    // Will be updated after sanitization
    blocked: false,         // Set to true if any check fails
    blockReason: null,      // Machine-readable reason code
    response: null,         // Pre-built fallback response for blocked content
    escalation: null,       // Escalation data if human review needed
    moderation: null        // Raw moderation API results for logging
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: INPUT SANITIZATION
  // Cleans the input by removing HTML tags, normalizing whitespace, and checking
  // for prompt injection attacks (attempts to manipulate the AI's behavior).
  // If injection is detected, the message is blocked immediately.
  // ─────────────────────────────────────────────────────────────────────────────
  const sanitizationResult = await sanitizeInput(text);
  // If sanitization blocked the input (e.g., prompt injection detected),
  // return early with a safe fallback response
  if (sanitizationResult.blocked) {
    pipelineResult.passed = false;
    pipelineResult.blocked = true;
    pipelineResult.blockReason = sanitizationResult.blockReason;
    pipelineResult.response = getBlockedInputResponse(sanitizationResult.blockReason);
    return pipelineResult;  // Early return - no further processing needed
  }
  // Store the cleaned text for subsequent pipeline stages
  pipelineResult.sanitizedText = sanitizationResult.sanitized;

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: CONTENT MODERATION
  // Uses OpenAI's Moderation API to check for harmful content across 13 categories:
  // hate speech, harassment, self-harm, sexual content, violence, etc.
  // Thresholds are configurable per category in the admin dashboard.
  // ─────────────────────────────────────────────────────────────────────────────
  const moderationResult = await moderateContent(pipelineResult.sanitizedText);
  // Store moderation results for logging and analytics
  pipelineResult.moderation = moderationResult;

  // If moderation flagged harmful content, block the message
  // and provide an appropriate fallback response based on the category
  if (moderationResult.shouldBlock) {
    // Get category-specific response (e.g., crisis resources for self-harm)
    const fallback = getModerationFallbackResponse(moderationResult.categories);
    pipelineResult.passed = false;
    pipelineResult.blocked = true;
    pipelineResult.blockReason = 'CONTENT_MODERATION';
    pipelineResult.response = fallback.message;
    pipelineResult.resources = fallback.resources;  // May include crisis hotline info

    // Some categories require immediate human review (escalation)
    // Crisis and threat content are highest priority
    if (fallback.shouldEscalate) {
      const escalationType = fallback.escalationType || 'moderation';
      pipelineResult.escalation = {
        shouldEscalate: true,
        reason: escalationType === 'crisis' ? 'CRISIS_DETECTED' :
                escalationType === 'threat' ? 'THREAT_DETECTED' : 'MODERATION_FLAGGED',
        type: escalationType,
        urgency: escalationType === 'crisis' || escalationType === 'threat' ? 'critical' : 'high'
      };
    }
    return pipelineResult;  // Early return - blocked content
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3: ESCALATION DETECTION
  // Scans for keywords indicating the user needs human assistance:
  // - Crisis: suicidal ideation, self-harm mentions (CRITICAL priority)
  // - Legal: lawyer, lawsuit, legal action (HIGH priority)
  // - Complaint: speak to manager, file complaint (MEDIUM priority)
  // - Sentiment: highly negative language patterns (MEDIUM priority)
  // ─────────────────────────────────────────────────────────────────────────────
  const escalationResult = analyzeEscalation(pipelineResult.sanitizedText);
  // Handle escalation scenarios - these don't always block the message
  // but flag the conversation for human review
  if (escalationResult.shouldEscalate) {
    pipelineResult.escalation = escalationResult;

    // CRISIS is a special case: we block normal flow and provide
    // immediate crisis resources (suicide prevention hotlines, etc.)
    // This ensures users in distress get help information right away
    if (escalationResult.type === 'crisis') {
      const crisisResponse = getEscalationResponse('crisis');
      pipelineResult.passed = false;  // Prevents normal AI response
      pipelineResult.response = crisisResponse.message;
      pipelineResult.resources = crisisResponse.resources;
      return pipelineResult;
    }
    // For non-crisis escalations (legal, complaint, sentiment),
    // the message can still be processed, but the conversation
    // is flagged for human follow-up
  }

  // All checks passed - input is safe for AI processing
  return pipelineResult;
}

/**
 * Process AI-generated output through safety checks.
 *
 * This function validates responses generated by the AI before sending
 * them to users. This is a defense-in-depth measure that catches any
 * inappropriate content the AI might generate despite system prompts.
 *
 * @param {string} text - The AI-generated response text
 * @param {string} conversationId - The conversation ID for logging
 * @returns {Promise<Object>} Result containing:
 *   - passed {boolean} - Whether output passed safety checks
 *   - text {string} - The original text (unchanged)
 *   - blocked {boolean} - Whether the output was blocked
 *   - blockReason {string|null} - Reason for blocking if applicable
 *   - response {string|null} - Fallback response if blocked
 *   - moderation {Object|null} - Moderation API results
 */
export async function processOutput(text, conversationId) {
  // Initialize result with safe defaults
  const pipelineResult = {
    passed: true,
    text: text,
    blocked: false,
    blockReason: null,
    response: null,
    moderation: null
  };

  // Run AI output through the same moderation API used for input
  // This catches any harmful content the AI might have generated
  const moderationResult = await moderateContent(text);
  pipelineResult.moderation = moderationResult;

  // If the AI generated inappropriate content, replace it with
  // a safe fallback and log the incident for review
  if (moderationResult.shouldBlock) {
    logger.warn({
      message: 'Output blocked by moderation',
      conversationId,
      categories: moderationResult.categories
    });

    pipelineResult.passed = false;
    pipelineResult.blocked = true;
    pipelineResult.blockReason = 'OUTPUT_MODERATION';
    // Generic fallback that doesn't reveal why the response was blocked
    pipelineResult.response = "I apologize, but I'm unable to provide that response. Let me try to help you in a different way. Could you please rephrase your question?";
    return pipelineResult;
  }

  return pipelineResult;
}

/**
 * Execute the complete safety pipeline for a user message.
 *
 * This is the main entry point called by the message route handler.
 * It orchestrates the full flow:
 * 1. Process input through safety checks
 * 2. If input passes, retrieve relevant context from knowledge base (RAG)
 * 3. Handle any escalations by updating the conversation in the database
 * 4. Track processing time for performance monitoring
 *
 * @param {string} userMessage - The raw message from the user
 * @param {string} conversationId - UUID of the current conversation
 * @returns {Promise<Object>} Complete pipeline result including:
 *   - inputPassed {boolean} - Whether input passed all safety checks
 *   - sanitizedInput {string} - Cleaned version of user message
 *   - blocked {boolean} - Whether message was blocked
 *   - blockReason {string|null} - Why message was blocked
 *   - fallbackResponse {string|null} - Pre-built response if blocked
 *   - resources {Array|null} - Crisis resources if applicable
 *   - escalation {Object|null} - Escalation details for human review
 *   - context {Object|null} - RAG context with relevant documents
 *   - processingTimeMs {number} - Pipeline execution time in milliseconds
 */
export async function runSafetyPipeline(userMessage, conversationId) {
  // Track execution time for performance monitoring
  // Target: < 500ms overhead for safety checks
  const startTime = Date.now();

  // Run input through all safety checks (sanitization, moderation, escalation)
  const inputResult = await processInput(userMessage);

  // Build the final result object that will be returned to the caller
  const result = {
    inputPassed: inputResult.passed,
    sanitizedInput: inputResult.sanitizedText,
    blocked: inputResult.blocked,
    blockReason: inputResult.blockReason,
    fallbackResponse: inputResult.response,
    resources: inputResult.resources || null,
    escalation: inputResult.escalation,
    context: null,              // Will be populated by RAG if input passes
    processingTimeMs: 0         // Will be calculated at the end
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RAG CONTEXT RETRIEVAL
  // Only retrieve knowledge base context if the input passed safety checks.
  // This avoids unnecessary database queries for blocked messages.
  // ─────────────────────────────────────────────────────────────────────────────
  if (inputResult.passed) {
    result.context = await retrieveContext(inputResult.sanitizedText);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ESCALATION HANDLING
  // If escalation was triggered, mark the conversation in the database
  // so it appears in the admin dashboard for human review.
  // ─────────────────────────────────────────────────────────────────────────────
  if (result.escalation?.shouldEscalate && conversationId) {
    await handleEscalation(conversationId, result.escalation);
  }

  // Calculate total pipeline processing time
  result.processingTimeMs = Date.now() - startTime;

  // Log completion for debugging and performance monitoring
  logger.debug({
    message: 'Safety pipeline completed',
    inputPassed: result.inputPassed,
    blocked: result.blocked,
    hasContext: result.context?.hasContext,
    escalation: result.escalation?.type,
    processingTimeMs: result.processingTimeMs
  });

  return result;
}
