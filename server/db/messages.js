import sql from './index.js';
import { updateConversationTimestamp } from './conversations.js';

export async function createMessage(conversationId, role, content, metadata = {}) {
  const { tokensUsed = null, responseTimeMs = null, moderationFlagged = false } = metadata;

  const result = await sql`
    INSERT INTO messages (conversation_id, role, content, tokens_used, response_time_ms, moderation_flagged)
    VALUES (${conversationId}, ${role}, ${content}, ${tokensUsed}, ${responseTimeMs}, ${moderationFlagged})
    RETURNING *
  `;

  // Update conversation timestamp
  await updateConversationTimestamp(conversationId);

  return result[0];
}

export async function getMessages(conversationId, limit = 10) {
  const messages = await sql`
    SELECT id, role, content, created_at, moderation_flagged
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  // Return in chronological order
  return messages.reverse();
}

export async function getMessage(id) {
  const result = await sql`
    SELECT * FROM messages WHERE id = ${id}
  `;
  return result[0] || null;
}

export async function updateModerationFlag(id, flagged) {
  const result = await sql`
    UPDATE messages
    SET moderation_flagged = ${flagged}
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0];
}

export async function getRecentContext(conversationId, limit = 10) {
  // Get recent messages for context (last N exchanges)
  const messages = await sql`
    SELECT role, content
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  // Return in chronological order for OpenAI
  return messages.reverse().map(m => ({
    role: m.role,
    content: m.content
  }));
}
