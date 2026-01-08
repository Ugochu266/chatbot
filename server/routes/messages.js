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

// POST /api/messages - Send message and get response
router.post('/', messageRateLimiter, validateMessage, async (req, res, next) => {
  try {
    const { conversationId, content } = req.body;
    const startTime = Date.now();

    // Validate conversation exists and belongs to session
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'NOT_FOUND');
    }
    if (conversation.session_id !== req.sessionId) {
      throw new AppError('Access denied', 403, 'FORBIDDEN');
    }

    // Run safety pipeline on input
    const safetyResult = await runSafetyPipeline(content, conversationId);

    // Save user message
    const userMessage = await createMessage(conversationId, 'user', content, {
      moderationFlagged: safetyResult.blocked
    });

    // If input was blocked, return fallback response
    if (!safetyResult.inputPassed) {
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
          blocked: true
        },
        escalated: safetyResult.escalation?.shouldEscalate || false,
        escalationType: safetyResult.escalation?.type || null,
        resources: safetyResult.resources || null
      });
    }

    // Get conversation history for context
    const history = await getRecentContext(conversationId, 10);
    const truncatedHistory = truncateHistory(history, 10);
    const formattedHistory = formatConversationHistory(truncatedHistory);

    // Add current user message
    formattedHistory.push({ role: 'user', content: safetyResult.sanitizedInput });

    // Generate response with RAG context
    const aiResponse = await generateResponse(formattedHistory, safetyResult.context);

    // Process output through safety pipeline
    const outputResult = await processOutput(aiResponse.content, conversationId);

    const finalResponse = outputResult.passed ? aiResponse.content : outputResult.response;

    // Save assistant message
    const responseTimeMs = Date.now() - startTime;
    const assistantMessage = await createMessage(conversationId, 'assistant', finalResponse, {
      tokensUsed: aiResponse.tokensUsed,
      responseTimeMs,
      moderationFlagged: !outputResult.passed
    });

    // Log moderation for assistant message
    if (outputResult.moderation) {
      await moderateAndLog(finalResponse, assistantMessage.id);
    }

    // Handle escalation response if needed
    let escalationInfo = null;
    if (safetyResult.escalation?.shouldEscalate) {
      escalationInfo = getEscalationResponse(safetyResult.escalation.type);
    }

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

// GET /api/messages/stream/:conversationId - SSE streaming endpoint
router.get('/stream/:conversationId', validateConversationId, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { message } = req.query;

    if (!message) {
      throw new AppError('Message query parameter is required', 400, 'VALIDATION_ERROR');
    }

    // Validate conversation
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'NOT_FOUND');
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const startTime = Date.now();

    // Run safety pipeline
    const safetyResult = await runSafetyPipeline(message, conversationId);

    // Save user message
    await createMessage(conversationId, 'user', message, {
      moderationFlagged: safetyResult.blocked
    });

    if (!safetyResult.inputPassed) {
      // Send fallback response
      res.write(`data: ${JSON.stringify({ type: 'content', content: safetyResult.fallbackResponse })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', blocked: true })}\n\n`);
      return res.end();
    }

    // Get conversation history
    const history = await getRecentContext(conversationId, 10);
    const formattedHistory = formatConversationHistory(truncateHistory(history, 10));
    formattedHistory.push({ role: 'user', content: safetyResult.sanitizedInput });

    // Stream response
    const stream = await generateStreamingResponse(formattedHistory, safetyResult.context);

    let fullContent = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
      }
    }

    // Save complete assistant message
    const responseTimeMs = Date.now() - startTime;
    await createMessage(conversationId, 'assistant', fullContent, {
      responseTimeMs
    });

    // Send completion event
    res.write(`data: ${JSON.stringify({
      type: 'done',
      responseTimeMs,
      escalated: safetyResult.escalation?.shouldEscalate || false
    })}\n\n`);

    res.end();
  } catch (error) {
    logger.error({ message: 'Streaming error', error: error.message });
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'An error occurred' })}\n\n`);
    res.end();
  }
});

export default router;
