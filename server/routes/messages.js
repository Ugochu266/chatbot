/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Messages Routes Module
 *
 * This module handles the core chat functionality of SafeChat - receiving user messages
 * and generating AI responses. It orchestrates the complete message flow:
 *
 * Flow Overview:
 * 1. User sends message → Safety pipeline checks → Save user message
 * 2. If blocked → Return fallback response
 * 3. If passed → Retrieve RAG context → Generate AI response
 * 4. Process AI output through safety checks → Save and return response
 *
 * Endpoints:
 * - POST /api/messages - Standard message send/receive (blocking)
 * - GET /api/messages/stream/:conversationId - Server-Sent Events streaming
 *
 * Safety Integration:
 * - All user input passes through sanitization, moderation, and escalation checks
 * - AI output is also checked for safety before delivery
 * - Escalated conversations are flagged for human review
 *
 * Base Path: /api/messages
 *
 * @module routes/messages
 */

import { Router } from 'express';
import { createMessage, getRecentContext } from '../db/messages.js';
import { getConversation } from '../db/conversations.js';
import { validateMessage, validateConversationId } from '../middleware/validator.js';
import { messageRateLimiter } from '../middleware/rateLimiter.js';
import { AppError, logger } from '../middleware/errorHandler.js';
import { runSafetyPipeline, processOutput } from '../services/pipeline.js';
import { generateResponse, generateStreamingResponse, formatConversationHistory, truncateHistory } from '../services/openai.js';
import { getEscalationResponse } from '../services/escalation.js';
import { moderateAndLog } from '../services/moderation.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// STANDARD MESSAGE ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/messages
 *
 * Send a user message and receive an AI response.
 * This is the main endpoint for chat interactions.
 *
 * The endpoint performs the following steps:
 * 1. Validates conversation ownership (session must match)
 * 2. Runs input through safety pipeline (sanitize → moderate → detect escalation)
 * 3. Saves the user message to database
 * 4. If blocked by safety: returns pre-built fallback response
 * 5. If passed: retrieves conversation history, generates AI response
 * 6. Runs AI output through safety check
 * 7. Saves and returns the assistant message
 *
 * Request Body:
 * - conversationId {uuid} - ID of the conversation to add message to
 * - content {string} - The user's message text
 *
 * Response:
 * - userMessage: The saved user message
 * - assistantMessage: The AI response (or fallback if blocked)
 * - escalated: Whether the conversation was flagged for human review
 * - escalationType: Type of escalation if applicable
 * - escalationInfo: Additional escalation details and resources
 * - context: Information about RAG documents used
 *
 * Middleware Applied:
 * - messageRateLimiter: Prevents spam (10 messages per minute)
 * - validateMessage: Validates request body format
 */
router.post('/', messageRateLimiter, validateMessage, async (req, res, next) => {
  try {
    const { conversationId, content } = req.body;
    const startTime = Date.now();  // Track response time for analytics

    // ─────────────────────────────────────────────────────────────────────────────
    // CONVERSATION VALIDATION
    // Verify the conversation exists and belongs to the requesting session
    // ─────────────────────────────────────────────────────────────────────────────
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'NOT_FOUND');
    }
    // Security: Ensure users can only access their own conversations
    if (conversation.session_id !== req.sessionId) {
      throw new AppError('Access denied', 403, 'FORBIDDEN');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SAFETY PIPELINE
    // Run input through all safety checks before processing
    // This includes: sanitization, content moderation, escalation detection
    // ─────────────────────────────────────────────────────────────────────────────
    const safetyResult = await runSafetyPipeline(content, conversationId);

    // ─────────────────────────────────────────────────────────────────────────────
    // SAVE USER MESSAGE
    // Always save the user's message, even if it was blocked
    // This provides a complete audit trail for escalated conversations
    // ─────────────────────────────────────────────────────────────────────────────
    const userMessage = await createMessage(conversationId, 'user', content, {
      moderationFlagged: safetyResult.blocked  // Mark if moderation flagged it
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // HANDLE BLOCKED INPUT
    // If the safety pipeline blocked the message, return a pre-built fallback
    // response and don't proceed with AI generation
    // ─────────────────────────────────────────────────────────────────────────────
    if (!safetyResult.inputPassed) {
      // Save the fallback response as the assistant message
      const assistantMessage = await createMessage(conversationId, 'assistant', safetyResult.fallbackResponse, {
        responseTimeMs: Date.now() - startTime
      });

      return res.json({
        success: true,
        userMessage: {
          id: userMessage.id,
          content: userMessage.content,
          role: 'user',
          createdAt: userMessage.created_at
        },
        assistantMessage: {
          id: assistantMessage.id,
          content: assistantMessage.content,
          role: 'assistant',
          createdAt: assistantMessage.created_at,
          blocked: true  // Flag that this was a blocked response
        },
        escalated: safetyResult.escalation?.shouldEscalate || false,
        escalationType: safetyResult.escalation?.type || null,
        resources: safetyResult.resources || null  // Crisis resources if applicable
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PREPARE CONVERSATION CONTEXT
    // Get recent messages for conversation continuity and truncate if needed
    // ─────────────────────────────────────────────────────────────────────────────
    const history = await getRecentContext(conversationId, 10);
    const truncatedHistory = truncateHistory(history, 10);  // Keep first + last messages
    const formattedHistory = formatConversationHistory(truncatedHistory);

    // Add the current (sanitized) user message to the history
    formattedHistory.push({ role: 'user', content: safetyResult.sanitizedInput });

    // ─────────────────────────────────────────────────────────────────────────────
    // GENERATE AI RESPONSE
    // Use OpenAI GPT-4 with RAG context from the safety pipeline
    // ─────────────────────────────────────────────────────────────────────────────
    const aiResponse = await generateResponse(formattedHistory, safetyResult.context);

    // ─────────────────────────────────────────────────────────────────────────────
    // OUTPUT SAFETY CHECK
    // Even AI-generated content must pass through moderation
    // This is defense-in-depth against AI generating inappropriate content
    // ─────────────────────────────────────────────────────────────────────────────
    const outputResult = await processOutput(aiResponse.content, conversationId);

    // Use the AI response if it passed, otherwise use the fallback
    const finalResponse = outputResult.passed ? aiResponse.content : outputResult.response;

    // ─────────────────────────────────────────────────────────────────────────────
    // SAVE ASSISTANT MESSAGE
    // Store the response with performance metrics
    // ─────────────────────────────────────────────────────────────────────────────
    const responseTimeMs = Date.now() - startTime;
    const assistantMessage = await createMessage(conversationId, 'assistant', finalResponse, {
      tokensUsed: aiResponse.tokensUsed,
      responseTimeMs,
      moderationFlagged: !outputResult.passed  // Mark if output was blocked
    });

    // Log moderation results for the assistant message (for analytics)
    if (outputResult.moderation) {
      await moderateAndLog(finalResponse, assistantMessage.id);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PREPARE ESCALATION INFO
    // If escalation was triggered, include appropriate response resources
    // ─────────────────────────────────────────────────────────────────────────────
    let escalationInfo = null;
    if (safetyResult.escalation?.shouldEscalate) {
      escalationInfo = getEscalationResponse(safetyResult.escalation.type);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // RETURN SUCCESS RESPONSE
    // ─────────────────────────────────────────────────────────────────────────────
    res.json({
      success: true,
      userMessage: {
        id: userMessage.id,
        content: userMessage.content,
        role: 'user',
        createdAt: userMessage.created_at
      },
      assistantMessage: {
        id: assistantMessage.id,
        content: assistantMessage.content,
        role: 'assistant',
        createdAt: assistantMessage.created_at,
        tokensUsed: aiResponse.tokensUsed,
        responseTimeMs
      },
      escalated: safetyResult.escalation?.shouldEscalate || false,
      escalationType: safetyResult.escalation?.type || null,
      escalationInfo,
      context: {
        documentsUsed: safetyResult.context?.documents?.length || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-SENT EVENTS (SSE) STREAMING ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/messages/stream/:conversationId
 *
 * Stream AI responses using Server-Sent Events (SSE).
 * This provides real-time response delivery for better UX.
 *
 * SSE allows the server to push data to the client as it becomes available,
 * so users see the response being "typed" in real-time rather than waiting
 * for the complete response.
 *
 * Path Parameters:
 * - conversationId {uuid} - The conversation to add the message to
 *
 * Query Parameters:
 * - message {string} - The user's message text (required)
 *
 * SSE Event Format:
 * - type: 'content' - A chunk of the response text
 * - type: 'done' - Stream complete with metadata
 * - type: 'error' - An error occurred
 *
 * Example SSE Messages:
 * data: {"type":"content","content":"Hello"}
 * data: {"type":"content","content":" there!"}
 * data: {"type":"done","responseTimeMs":1234}
 */
router.get('/stream/:conversationId', validateConversationId, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { message } = req.query;

    // Validate that message query parameter was provided
    if (!message) {
      throw new AppError('Message query parameter is required', 400, 'VALIDATION_ERROR');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CONVERSATION VALIDATION
    // ─────────────────────────────────────────────────────────────────────────────
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'NOT_FOUND');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SET UP SSE HEADERS
    // These headers are required for Server-Sent Events to work properly
    // ─────────────────────────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');  // SSE content type
    res.setHeader('Cache-Control', 'no-cache');          // Don't cache the stream
    res.setHeader('Connection', 'keep-alive');           // Keep connection open
    res.setHeader('X-Accel-Buffering', 'no');           // Disable nginx buffering

    const startTime = Date.now();

    // ─────────────────────────────────────────────────────────────────────────────
    // SAFETY PIPELINE
    // Run input through safety checks before processing
    // ─────────────────────────────────────────────────────────────────────────────
    const safetyResult = await runSafetyPipeline(message, conversationId);

    // Save user message to database
    await createMessage(conversationId, 'user', message, {
      moderationFlagged: safetyResult.blocked
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // HANDLE BLOCKED INPUT
    // For blocked messages, send the fallback response and end the stream
    // ─────────────────────────────────────────────────────────────────────────────
    if (!safetyResult.inputPassed) {
      // Send the fallback response as a single chunk
      res.write(`data: ${JSON.stringify({ type: 'content', content: safetyResult.fallbackResponse })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', blocked: true })}\n\n`);
      return res.end();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PREPARE CONVERSATION CONTEXT
    // ─────────────────────────────────────────────────────────────────────────────
    const history = await getRecentContext(conversationId, 10);
    const formattedHistory = formatConversationHistory(truncateHistory(history, 10));
    formattedHistory.push({ role: 'user', content: safetyResult.sanitizedInput });

    // ─────────────────────────────────────────────────────────────────────────────
    // STREAM AI RESPONSE
    // Get streaming response from OpenAI and forward chunks to client
    // ─────────────────────────────────────────────────────────────────────────────
    const stream = await generateStreamingResponse(formattedHistory, safetyResult.context);

    let fullContent = '';  // Accumulate content to save complete message later

    // Iterate through stream chunks and send each to the client
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        // Send chunk to client as SSE event
        res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SAVE COMPLETE RESPONSE
    // After streaming completes, save the full message to database
    // ─────────────────────────────────────────────────────────────────────────────
    const responseTimeMs = Date.now() - startTime;
    await createMessage(conversationId, 'assistant', fullContent, {
      responseTimeMs
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // SEND COMPLETION EVENT
    // Signal to client that the stream is complete with final metadata
    // ─────────────────────────────────────────────────────────────────────────────
    res.write(`data: ${JSON.stringify({
      type: 'done',
      responseTimeMs,
      escalated: safetyResult.escalation?.shouldEscalate || false
    })}\n\n`);

    res.end();
  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────────────
    // ERROR HANDLING
    // For streaming errors, send error event and close stream gracefully
    // ─────────────────────────────────────────────────────────────────────────────
    logger.error({ message: 'Streaming error', error: error.message });
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'An error occurred' })}\n\n`);
    res.end();
  }
});

export default router;
