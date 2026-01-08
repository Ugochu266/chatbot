import sql from './index.js';

export async function logModeration(messageId, flagged, categories, scores) {
  const result = await sql`
    INSERT INTO moderation_logs (message_id, flagged, categories, scores)
    VALUES (${messageId}, ${flagged}, ${JSON.stringify(categories)}, ${JSON.stringify(scores)})
    RETURNING *
  `;
  return result[0];
}

export async function getModerationLog(messageId) {
  const result = await sql`
    SELECT * FROM moderation_logs WHERE message_id = ${messageId}
  `;
  return result[0] || null;
}

export async function getFlaggedLogs(page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  const logs = await sql`
    SELECT ml.*, m.content, m.role
    FROM moderation_logs ml
    JOIN messages m ON ml.message_id = m.id
    WHERE ml.flagged = true
    ORDER BY ml.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return logs;
}
