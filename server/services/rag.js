/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * RAG (Retrieval-Augmented Generation) Service
 *
 * This service implements the retrieval component of RAG, which enhances AI responses
 * by providing relevant context from a knowledge base. Instead of relying solely on
 * the AI's training data, RAG fetches relevant documents to ground responses in
 * accurate, up-to-date information.
 *
 * How RAG Works in SafeChat:
 * 1. User sends a message
 * 2. This service searches the knowledge base for relevant documents
 * 3. Retrieved documents are injected into the AI's system prompt
 * 4. AI generates response using both its training AND the retrieved context
 *
 * Benefits of RAG:
 * - More accurate responses based on actual documentation
 * - Reduces AI hallucination by providing factual grounding
 * - Easy to update - just add/modify documents in the knowledge base
 * - Transparent - we can show users which docs informed the response
 *
 * @module services/rag
 */

import { searchDocuments } from '../db/knowledgeBase.js';
import { searchSpareParts, initSparePartsTable } from '../db/spareParts.js';
import { logger } from '../middleware/errorHandler.js';

// Track if spare parts table has been initialized
let sparePartsInitialized = false;

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieve relevant context documents for a user query.
 *
 * This is the main entry point for the RAG system. It searches the knowledge
 * base for documents that are semantically relevant to the user's query and
 * formats them for injection into the AI prompt.
 *
 * The function is designed to fail gracefully - if the database is unavailable
 * or an error occurs, it returns an empty context rather than throwing.
 *
 * @param {string} query - The user's message/query to find context for
 * @param {number} [limit=3] - Maximum number of documents to retrieve
 *   - Higher limits provide more context but increase token usage
 *   - Default of 3 balances informativeness with cost
 * @returns {Promise<Object>} Context result containing:
 *   - hasContext {boolean} - Whether any relevant documents were found
 *   - documents {Array} - Metadata about retrieved documents (id, title, category, score)
 *   - contextText {string|null} - Formatted text ready for prompt injection
 *   - error {string|undefined} - Error message if retrieval failed
 *
 * @example
 * // Successful retrieval
 * const context = await retrieveContext("How do I reset my password?");
 * // Returns: {
 * //   hasContext: true,
 * //   documents: [{ title: "Password Reset Guide", ... }],
 * //   contextText: "RELEVANT DOCUMENTATION:\n[Document 1: Password Reset Guide]..."
 * // }
 *
 * @example
 * // No relevant documents found
 * const context = await retrieveContext("Tell me a joke");
 * // Returns: { hasContext: false, documents: [], contextText: null }
 */
export async function retrieveContext(query, limit = 3) {
  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // ENSURE SPARE PARTS TABLE EXISTS
    // Initialize the table on first call to avoid errors
    // ─────────────────────────────────────────────────────────────────────────────
    if (!sparePartsInitialized) {
      try {
        await initSparePartsTable();
        sparePartsInitialized = true;
      } catch (err) {
        logger.warn({ message: 'Failed to initialize spare parts table', error: err.message });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PARALLEL SEARCH: KNOWLEDGE BASE + SPARE PARTS
    // Search both data sources simultaneously for better coverage.
    // ─────────────────────────────────────────────────────────────────────────────
    const [documents, spareParts] = await Promise.all([
      searchDocuments(query, limit).catch(() => []),
      searchSpareParts(query, limit).catch(() => [])
    ]);

    // No relevant content found in either source
    if (documents.length === 0 && spareParts.length === 0) {
      return {
        hasContext: false,
        documents: [],
        spareParts: [],
        contextText: null
      };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // FORMAT CONTEXT FOR PROMPT
    // Combine both documents and spare parts into a structured format.
    // ─────────────────────────────────────────────────────────────────────────────
    const contextText = formatCombinedContextForPrompt(documents, spareParts);

    return {
      hasContext: true,
      // Return document metadata for logging
      documents: documents.map(d => ({
        id: d.id,
        title: d.title,
        category: d.category,
        relevanceScore: d.relevance_score
      })),
      // Return spare parts metadata
      spareParts: spareParts.map(p => ({
        id: p.id,
        partNumber: p.part_number,
        partDescription: p.part_description,
        vehicleMake: p.vehicle_make,
        vehicleModel: p.vehicle_model,
        relevanceScore: p.relevance_score
      })),
      contextText
    };
  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────────────
    // ERROR HANDLING - FAIL GRACEFULLY
    // If retrieval fails, log the error and return empty context.
    // The AI will still respond, just without RAG augmentation.
    // This prevents database issues from completely blocking the chat.
    // ─────────────────────────────────────────────────────────────────────────────
    logger.error({
      message: 'RAG retrieval error',
      error: error.message,
      query
    });

    return {
      hasContext: false,
      documents: [],
      spareParts: [],
      contextText: null,
      error: error.message  // Include error for debugging
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format retrieved documents into a structured context block for the AI prompt.
 *
 * This function creates a clearly delimited section that:
 * - Numbers each document for easy reference
 * - Includes the document title for context
 * - Provides the full document content
 * - Ends with instructions for the AI on how to use the context
 *
 * The format is designed to:
 * - Be clearly distinguishable from user messages
 * - Help the AI understand document boundaries
 * - Provide clear guidance on context usage
 *
 * @param {Array<Object>} documents - Array of document objects from the database
 *   Each document should have: title, content, category, id
 * @returns {string|null} Formatted context string, or null if no documents
 * @private
 */
function formatContextForPrompt(documents) {
  // Guard clause - return null for empty input
  if (documents.length === 0) return null;

  // ─────────────────────────────────────────────────────────────────────────────
  // FORMAT EACH DOCUMENT
  // Each document gets a numbered header with its title, followed by content.
  // The numbering helps the AI cite specific sources in responses.
  // ─────────────────────────────────────────────────────────────────────────────
  const contextParts = documents.map((doc, index) => {
    return `[Document ${index + 1}: ${doc.title}]\n${doc.content}`;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BUILD COMPLETE CONTEXT BLOCK
  // The block has:
  // - A header indicating the start of documentation
  // - All documents separated by visual dividers
  // - A footer with usage instructions for the AI
  // ─────────────────────────────────────────────────────────────────────────────
  return `
RELEVANT DOCUMENTATION:
${contextParts.join('\n\n---\n\n')}

END OF DOCUMENTATION

Please use the above documentation to help answer the user's question. If the documentation doesn't contain relevant information, acknowledge that you don't have specific information about their query and offer to help in other ways.
`.trim();
}

/**
 * Format spare parts data into a structured context block for the AI prompt.
 *
 * Creates a detailed listing of spare parts including:
 * - Part number (for ordering/reference)
 * - Description
 * - Vehicle compatibility (make, model, years)
 * - Pricing (GBP and USD)
 * - Stock status
 * - Compatibility notes
 *
 * @param {Array<Object>} parts - Array of spare part objects from the database
 * @returns {string|null} Formatted parts context, or null if no parts
 * @private
 */
function formatSparePartsForPrompt(parts) {
  if (parts.length === 0) return null;

  const partsList = parts.map((part, index) => {
    return `[Part ${index + 1}: ${part.part_number}]
Description: ${part.part_description}
Vehicle: ${part.vehicle_make} ${part.vehicle_model} (${part.year_from}-${part.year_to})
Price: £${parseFloat(part.price_gbp).toFixed(2)} GBP / $${parseFloat(part.price_usd).toFixed(2)} USD
Stock Status: ${part.stock_status}
${part.compatibility_notes ? `Notes: ${part.compatibility_notes}` : ''}`.trim();
  });

  return partsList.join('\n\n');
}

/**
 * Format combined knowledge base documents and spare parts for the AI prompt.
 *
 * This function creates a comprehensive context block that includes:
 * - General documentation from the knowledge base
 * - Specific spare parts information from the catalog
 *
 * @param {Array<Object>} documents - Knowledge base documents
 * @param {Array<Object>} spareParts - Spare parts from the catalog
 * @returns {string|null} Combined formatted context, or null if both empty
 * @private
 */
function formatCombinedContextForPrompt(documents, spareParts) {
  const sections = [];

  // Add knowledge base documents section
  if (documents.length > 0) {
    const docParts = documents.map((doc, index) => {
      return `[Document ${index + 1}: ${doc.title}]\n${doc.content}`;
    });
    sections.push(`GENERAL DOCUMENTATION:\n${docParts.join('\n\n---\n\n')}`);
  }

  // Add spare parts section
  if (spareParts.length > 0) {
    const partsText = formatSparePartsForPrompt(spareParts);
    sections.push(`SPARE PARTS CATALOG:\n${partsText}`);
  }

  if (sections.length === 0) return null;

  return `
${sections.join('\n\n════════════════════════════════════════════════════════════════════════════════\n\n')}

END OF REFERENCE DATA

Instructions for responding:
- For spare parts inquiries: Provide the part number, price, and compatibility information from the catalog above.
- Always mention stock status when discussing spare parts.
- If asked about a part not in the catalog, acknowledge that and suggest the user contact support for availability.
- Use the documentation and spare parts data to provide accurate, helpful responses.
`.trim();
}

/**
 * Create a complete system prompt by combining base prompt with RAG context.
 *
 * This function is the final step in RAG preparation. It takes the base
 * system prompt (defining the AI's role and behavior) and augments it with
 * retrieved context when available.
 *
 * When no context is found, it adds a note instructing the AI to acknowledge
 * uncertainty rather than making things up. This helps prevent hallucination.
 *
 * @param {string} basePrompt - The base system prompt defining AI behavior
 * @param {Object|null} context - Context object from retrieveContext()
 *   Should have hasContext boolean and contextText string
 * @returns {string} Complete system prompt ready for OpenAI API
 *
 * @example
 * // With context available
 * const prompt = createRAGSystemPrompt(BASE_PROMPT, {
 *   hasContext: true,
 *   contextText: "RELEVANT DOCUMENTATION:\n..."
 * });
 *
 * @example
 * // Without context
 * const prompt = createRAGSystemPrompt(BASE_PROMPT, null);
 * // Returns base prompt + note about no documentation found
 */
export function createRAGSystemPrompt(basePrompt, context) {
  // ─────────────────────────────────────────────────────────────────────────────
  // NO CONTEXT CASE
  // When we don't have relevant documentation, add a note instructing the AI
  // to be upfront about not having specific information rather than guessing.
  // ─────────────────────────────────────────────────────────────────────────────
  if (!context || !context.hasContext) {
    return `${basePrompt}

NOTE: No specific documentation was found for this query. If you're unsure about specific details, acknowledge this and offer to help the user find the right resources or escalate to a human agent.`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WITH CONTEXT CASE
  // Append the formatted context to the base prompt.
  // The AI will now have both its behavioral instructions AND relevant docs.
  // ─────────────────────────────────────────────────────────────────────────────
  return `${basePrompt}

${context.contextText}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY PROCESSING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract meaningful keywords from a user query for improved search.
 *
 * This function processes user input to extract the most relevant search terms by:
 * 1. Converting to lowercase for consistent matching
 * 2. Removing punctuation that might interfere with matching
 * 3. Splitting into individual words
 * 4. Filtering out common stop words (the, is, a, etc.)
 * 5. Removing very short words (< 3 chars) that are usually not meaningful
 *
 * The result is a list of keywords that can be used for:
 * - Full-text search queries
 * - Keyword-based relevance scoring
 * - Query expansion/refinement
 *
 * @param {string} query - The user's raw query text
 * @returns {Array<string>} Array of meaningful keywords extracted from the query
 *
 * @example
 * extractKeywords("How do I reset my password?")
 * // Returns: ["reset", "password"]
 *
 * @example
 * extractKeywords("What is the refund policy for damaged items?")
 * // Returns: ["refund", "policy", "damaged", "items"]
 */
export function extractKeywords(query) {
  // ─────────────────────────────────────────────────────────────────────────────
  // STOP WORDS LIST
  // These are common English words that don't carry significant meaning for search.
  // Removing them helps focus on the important content words.
  // This list covers: articles, prepositions, pronouns, common verbs, etc.
  // ─────────────────────────────────────────────────────────────────────────────
  const stopWords = new Set([
    // Articles and determiners
    'a', 'an', 'the', 'this', 'that', 'these', 'those',
    // Common verbs (be, have, do)
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did',
    // Modal verbs
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
    // Prepositions
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once',
    // Adverbs and conjunctions
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'and', 'but', 'if', 'or', 'because', 'until', 'while', 'about',
    // Question words and relatives
    'what', 'which', 'who', 'whom',
    // Personal pronouns
    'am', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
    'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
    'it', 'its', 'they', 'them', 'their', 'theirs',
    // Common conversational words
    'hi', 'hello', 'hey', 'please', 'thanks', 'thank'
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // KEYWORD EXTRACTION PIPELINE
  // 1. Lowercase for case-insensitive matching
  // 2. Remove punctuation (keeps only word characters and spaces)
  // 3. Split into array of words
  // 4. Filter out stop words and short words
  // ─────────────────────────────────────────────────────────────────────────────
  return query
    .toLowerCase()                    // Normalize case
    .replace(/[^\w\s]/g, '')         // Remove punctuation
    .split(/\s+/)                    // Split on whitespace
    .filter(word =>
      word.length > 2 &&             // Must be at least 3 characters
      !stopWords.has(word)           // Must not be a stop word
    );
}
