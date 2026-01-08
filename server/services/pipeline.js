import { sanitizeInput, getBlockedInputResponse } from './sanitization.js';
import { moderateContent, getModerationFallbackResponse } from './moderation.js';
import { retrieveContext } from './rag.js';
import { analyzeEscalation, getEscalationResponse, handleEscalation } from './escalation.js';
import { logger } from '../middleware/errorHandler.js';

// Process input through safety pipeline
export async function processInput(text) {
  const pipelineResult = {
    passed: true,
    sanitizedText: text,
    blocked: false,
    blockReason: null,
    response: null,
    escalation: null,
    moderation: null
  };

  // Step 1: Input Sanitization
  const sanitizationResult = await sanitizeInput(text);
  if (sanitizationResult.blocked) {
    pipelineResult.passed = false;
    pipelineResult.blocked = true;
    pipelineResult.blockReason = sanitizationResult.blockReason;
    pipelineResult.response = getBlockedInputResponse(sanitizationResult.blockReason);
    return pipelineResult;
  }
  pipelineResult.sanitizedText = sanitizationResult.sanitized;

  // Step 2: Input Moderation
  const moderationResult = await moderateContent(pipelineResult.sanitizedText);
  pipelineResult.moderation = moderationResult;

  if (moderationResult.shouldBlock) {
    const fallback = getModerationFallbackResponse(moderationResult.categories);
    pipelineResult.passed = false;
    pipelineResult.blocked = true;
    pipelineResult.blockReason = 'CONTENT_MODERATION';
    pipelineResult.response = fallback.message;
    pipelineResult.resources = fallback.resources;

    if (fallback.shouldEscalate) {
      pipelineResult.escalation = {
        shouldEscalate: true,
        reason: 'MODERATION_FLAGGED',
        type: 'crisis',
        urgency: 'critical'
      };
    }
    return pipelineResult;
  }

  // Step 3: Escalation Check on Input
  const escalationResult = analyzeEscalation(pipelineResult.sanitizedText);
  if (escalationResult.shouldEscalate) {
    pipelineResult.escalation = escalationResult;

    // For crisis, we still want to respond with resources
    if (escalationResult.type === 'crisis') {
      const crisisResponse = getEscalationResponse('crisis');
      pipelineResult.passed = false;
      pipelineResult.response = crisisResponse.message;
      pipelineResult.resources = crisisResponse.resources;
      return pipelineResult;
    }
  }

  return pipelineResult;
}

// Process output through safety pipeline
export async function processOutput(text, conversationId) {
  const pipelineResult = {
    passed: true,
    text: text,
    blocked: false,
    blockReason: null,
    response: null,
    moderation: null
  };

  // Output Moderation
  const moderationResult = await moderateContent(text);
  pipelineResult.moderation = moderationResult;

  if (moderationResult.shouldBlock) {
    logger.warn({
      message: 'Output blocked by moderation',
      conversationId,
      categories: moderationResult.categories
    });

    pipelineResult.passed = false;
    pipelineResult.blocked = true;
    pipelineResult.blockReason = 'OUTPUT_MODERATION';
    pipelineResult.response = "I apologize, but I'm unable to provide that response. Let me try to help you in a different way. Could you please rephrase your question?";
    return pipelineResult;
  }

  return pipelineResult;
}

// Full pipeline for message processing
export async function runSafetyPipeline(userMessage, conversationId) {
  const startTime = Date.now();

  // Process input
  const inputResult = await processInput(userMessage);

  const result = {
    inputPassed: inputResult.passed,
    sanitizedInput: inputResult.sanitizedText,
    blocked: inputResult.blocked,
    blockReason: inputResult.blockReason,
    fallbackResponse: inputResult.response,
    resources: inputResult.resources || null,
    escalation: inputResult.escalation,
    context: null,
    processingTimeMs: 0
  };

  // If input passed, retrieve RAG context
  if (inputResult.passed) {
    result.context = await retrieveContext(inputResult.sanitizedText);
  }

  // Handle escalation if needed
  if (result.escalation?.shouldEscalate && conversationId) {
    await handleEscalation(conversationId, result.escalation);
  }

  result.processingTimeMs = Date.now() - startTime;

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
