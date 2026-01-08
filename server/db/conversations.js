import sql from './index.js';

export async function createConversation(sessionId) {
  const result = await sql`
    INSERT INTO conversations (session_id)
    VALUES (${sessionId})
    RETURNING *
  `;
  return result[0];
}

export async function getConversation(id) {
  const result = await sql`
    SELECT * FROM conversations WHERE id = ${id}
  `;
  return result[0] || null;
}

export async function getConversationWithMessages(id) {
  const conversation = await getConversation(id);
  if (!conversation) return null;

  const messages = await sql`
    SELECT id, role, content, created_at, moderation_flagged
    FROM messages
    WHERE conversation_id = ${id}
    ORDER BY created_at ASC
  `;

  return { ...conversation, messages };
}

export async function listConversations(sessionId, page = 1, limit = 10) {
  const offset = (page - 1) * limit;

  const conversations = await sql`
    SELECT c.*,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    WHERE c.session_id = ${sessionId}
    ORDER BY c.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countResult = await sql`
    SELECT COUNT(*) as total FROM conversations WHERE session_id = ${sessionId}
  `;

  return {
    conversations,
    total: parseInt(countResult[0].total),
    page,
    limit,
    totalPages: Math.ceil(countResult[0].total / limit)
  };
}

export async function updateEscalation(id, reason) {
  const result = await sql`
    UPDATE conversations
    SET escalated = true, escalation_reason = ${reason}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0];
}

export async function getEscalatedConversations(page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  const conversations = await sql`
    SELECT c.*,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM conversations c
    WHERE c.escalated = true
    ORDER BY c.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countResult = await sql`
    SELECT COUNT(*) as total FROM conversations WHERE escalated = true
  `;

  return {
    conversations,
    total: parseInt(countResult[0].total),
    page,
    limit
  };
}

export async function updateConversationTimestamp(id) {
  await sql`
    UPDATE conversations SET updated_at = NOW() WHERE id = ${id}
  `;
}
