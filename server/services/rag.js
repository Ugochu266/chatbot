import { searchDocuments } from '../db/knowledgeBase.js';
import { logger } from '../middleware/errorHandler.js';

// Retrieve relevant context for a query
export async function retrieveContext(query, limit = 3) {
  try {
    const documents = await searchDocuments(query, limit);

    if (documents.length === 0) {
      return {
        hasContext: false,
        documents: [],
        contextText: null
      };
    }

    // Format documents for context injection
    const contextText = formatContextForPrompt(documents);

    return {
      hasContext: true,
      documents: documents.map(d => ({
        id: d.id,
        title: d.title,
        category: d.category,
        relevanceScore: d.relevance_score
      })),
      contextText
    };
  } catch (error) {
    logger.error({
      message: 'RAG retrieval error',
      error: error.message,
      query
    });

    return {
      hasContext: false,
      documents: [],
      contextText: null,
      error: error.message
    };
  }
}

// Format retrieved documents into context for the prompt
function formatContextForPrompt(documents) {
  if (documents.length === 0) return null;

  const contextParts = documents.map((doc, index) => {
    return `[Document ${index + 1}: ${doc.title}]\n${doc.content}`;
  });

  return `
RELEVANT DOCUMENTATION:
${contextParts.join('\n\n---\n\n')}

END OF DOCUMENTATION

Please use the above documentation to help answer the user's question. If the documentation doesn't contain relevant information, acknowledge that you don't have specific information about their query and offer to help in other ways.
`.trim();
}

// Create system prompt with RAG context
export function createRAGSystemPrompt(basePrompt, context) {
  if (!context || !context.hasContext) {
    return `${basePrompt}

NOTE: No specific documentation was found for this query. If you're unsure about specific details, acknowledge this and offer to help the user find the right resources or escalate to a human agent.`;
  }

  return `${basePrompt}

${context.contextText}`;
}

// Extract keywords from query for better search
export function extractKeywords(query) {
  // Remove common stop words
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'about',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am',
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'you', 'your', 'yours',
    'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'they', 'them',
    'their', 'theirs', 'hi', 'hello', 'hey', 'please', 'thanks', 'thank'
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}
