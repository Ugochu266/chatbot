import sql from './index.js';

export async function searchDocuments(query, limit = 3) {
  // Extract keywords from query (simple word tokenization)
  const keywords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);

  if (keywords.length === 0) {
    return [];
  }

  // Search using keyword matching and text search
  const results = await sql`
    SELECT id, title, category, content,
      (
        -- Score based on keyword matches in title and content
        (SELECT COUNT(*) FROM unnest(${keywords}::text[]) AS kw
         WHERE LOWER(title) LIKE '%' || kw || '%') * 3 +
        (SELECT COUNT(*) FROM unnest(${keywords}::text[]) AS kw
         WHERE LOWER(content) LIKE '%' || kw || '%') +
        (SELECT COUNT(*) FROM unnest(keywords) AS doc_kw, unnest(${keywords}::text[]) AS search_kw
         WHERE LOWER(doc_kw) = search_kw) * 2
      ) as relevance_score
    FROM knowledge_base
    WHERE
      (SELECT bool_or(LOWER(title) LIKE '%' || kw || '%') FROM unnest(${keywords}::text[]) AS kw) OR
      (SELECT bool_or(LOWER(content) LIKE '%' || kw || '%') FROM unnest(${keywords}::text[]) AS kw) OR
      (SELECT bool_or(LOWER(k) = ANY(${keywords}::text[])) FROM unnest(keywords) AS k)
    ORDER BY relevance_score DESC
    LIMIT ${limit}
  `;

  return results;
}

export async function getDocumentsByCategory(category) {
  const results = await sql`
    SELECT id, title, category, content, keywords
    FROM knowledge_base
    WHERE category = ${category}
    ORDER BY title
  `;
  return results;
}

export async function getDocument(id) {
  const result = await sql`
    SELECT * FROM knowledge_base WHERE id = ${id}
  `;
  return result[0] || null;
}

export async function addDocument(title, category, content, keywords = []) {
  const result = await sql`
    INSERT INTO knowledge_base (title, category, content, keywords)
    VALUES (${title}, ${category}, ${content}, ${keywords})
    RETURNING *
  `;
  return result[0];
}

export async function updateDocument(id, title, category, content, keywords = []) {
  const result = await sql`
    UPDATE knowledge_base
    SET title = ${title}, category = ${category}, content = ${content}, keywords = ${keywords}
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0];
}

export async function deleteDocument(id) {
  await sql`DELETE FROM knowledge_base WHERE id = ${id}`;
}

export async function getAllCategories() {
  const result = await sql`
    SELECT DISTINCT category FROM knowledge_base ORDER BY category
  `;
  return result.map(r => r.category);
}
