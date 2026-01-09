/**
 * Spare Parts Database Module
 *
 * This module handles all database operations for the spare parts catalog in SafeChat.
 * The spare parts data provides context for AI responses through RAG (Retrieval-Augmented
 * Generation) when users ask about vehicle parts, pricing, availability, etc.
 *
 * Table Schema (spare_parts):
 * - id: Serial primary key
 * - vehicle_make: Manufacturer (Toyota, Honda, Ford, etc.)
 * - vehicle_model: Model name (Camry, Civic, F-150, etc.)
 * - year_from: Start year of compatibility range
 * - year_to: End year of compatibility range
 * - part_number: Unique part identifier (e.g., TOY-CAM-BRK-001)
 * - part_category: Category (Brakes, Filters, Ignition, etc.)
 * - part_description: Human-readable description
 * - price_gbp: Price in British Pounds
 * - price_usd: Price in US Dollars
 * - stock_status: Availability (In Stock, Out of Stock, Low Stock)
 * - compatibility_notes: Additional compatibility information
 * - created_at: Timestamp when record was created
 * - updated_at: Timestamp of last update
 *
 * Search Algorithm:
 * - Multi-field matching across make, model, part number, category, description
 * - Year range filtering for vehicle compatibility
 * - Results ordered by relevance score
 *
 * @module db/spareParts
 */

import sql from './index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize the spare_parts table if it doesn't exist.
 * Called on server startup to ensure schema is ready.
 */
export async function initSparePartsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS spare_parts (
      id SERIAL PRIMARY KEY,
      vehicle_make VARCHAR(100) NOT NULL,
      vehicle_model VARCHAR(100) NOT NULL,
      year_from INTEGER NOT NULL,
      year_to INTEGER NOT NULL,
      part_number VARCHAR(50) NOT NULL UNIQUE,
      part_category VARCHAR(100) NOT NULL,
      part_description TEXT NOT NULL,
      price_gbp DECIMAL(10,2) NOT NULL,
      price_usd DECIMAL(10,2) NOT NULL,
      stock_status VARCHAR(50) NOT NULL DEFAULT 'In Stock',
      compatibility_notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Create indexes for common search patterns
  await sql`
    CREATE INDEX IF NOT EXISTS idx_spare_parts_make_model
    ON spare_parts (vehicle_make, vehicle_model)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_spare_parts_part_number
    ON spare_parts (part_number)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_spare_parts_category
    ON spare_parts (part_category)
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPARE PARTS SEARCH (RAG)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search spare parts for relevant items based on user query.
 *
 * This is the core RAG function - it finds parts relevant to a user's
 * query using multi-field matching with weighted scoring.
 *
 * Scoring System:
 * - Part number exact match: +10 points (most specific)
 * - Vehicle make match: +5 points
 * - Vehicle model match: +5 points
 * - Part category match: +3 points
 * - Description keyword match: +1 point per keyword
 *
 * @param {string} query - The user's question or search query
 * @param {number} [limit=5] - Maximum number of parts to return
 * @returns {Promise<Array>} Array of matching spare parts sorted by relevance
 */
export async function searchSpareParts(query, limit = 5) {
  // Extract keywords from query
  const keywords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);

  if (keywords.length === 0) {
    return [];
  }

  // Build search pattern for ILIKE
  const searchPattern = `%${keywords.join('%')}%`;

  const results = await sql`
    SELECT *,
      (
        -- Part number match (highest priority)
        CASE WHEN LOWER(part_number) LIKE ANY(${keywords.map(k => `%${k}%`)}) THEN 10 ELSE 0 END +
        -- Vehicle make match
        CASE WHEN LOWER(vehicle_make) LIKE ANY(${keywords.map(k => `%${k}%`)}) THEN 5 ELSE 0 END +
        -- Vehicle model match
        CASE WHEN LOWER(vehicle_model) LIKE ANY(${keywords.map(k => `%${k}%`)}) THEN 5 ELSE 0 END +
        -- Part category match
        CASE WHEN LOWER(part_category) LIKE ANY(${keywords.map(k => `%${k}%`)}) THEN 3 ELSE 0 END +
        -- Description keyword matches
        (SELECT COUNT(*) FROM unnest(${keywords}::text[]) AS kw
         WHERE LOWER(part_description) LIKE '%' || kw || '%')
      ) as relevance_score
    FROM spare_parts
    WHERE
      LOWER(part_number) LIKE ${searchPattern} OR
      LOWER(vehicle_make) LIKE ${searchPattern} OR
      LOWER(vehicle_model) LIKE ${searchPattern} OR
      LOWER(part_category) LIKE ${searchPattern} OR
      LOWER(part_description) LIKE ${searchPattern} OR
      LOWER(compatibility_notes) LIKE ${searchPattern}
    ORDER BY relevance_score DESC
    LIMIT ${limit}
  `;

  return results;
}

/**
 * Search spare parts by vehicle specification.
 *
 * Finds parts compatible with a specific vehicle make, model, and year.
 *
 * @param {string} make - Vehicle manufacturer
 * @param {string} model - Vehicle model
 * @param {number} [year] - Vehicle year (optional)
 * @param {string} [category] - Part category filter (optional)
 * @returns {Promise<Array>} Array of compatible spare parts
 */
export async function searchByVehicle(make, model, year = null, category = null) {
  let results;

  if (year && category) {
    results = await sql`
      SELECT * FROM spare_parts
      WHERE LOWER(vehicle_make) = LOWER(${make})
        AND LOWER(vehicle_model) = LOWER(${model})
        AND ${year} BETWEEN year_from AND year_to
        AND LOWER(part_category) = LOWER(${category})
      ORDER BY part_category, part_description
    `;
  } else if (year) {
    results = await sql`
      SELECT * FROM spare_parts
      WHERE LOWER(vehicle_make) = LOWER(${make})
        AND LOWER(vehicle_model) = LOWER(${model})
        AND ${year} BETWEEN year_from AND year_to
      ORDER BY part_category, part_description
    `;
  } else if (category) {
    results = await sql`
      SELECT * FROM spare_parts
      WHERE LOWER(vehicle_make) = LOWER(${make})
        AND LOWER(vehicle_model) = LOWER(${model})
        AND LOWER(part_category) = LOWER(${category})
      ORDER BY part_category, part_description
    `;
  } else {
    results = await sql`
      SELECT * FROM spare_parts
      WHERE LOWER(vehicle_make) = LOWER(${make})
        AND LOWER(vehicle_model) = LOWER(${model})
      ORDER BY part_category, part_description
    `;
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPARE PARTS RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all spare parts, optionally filtered.
 *
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.category] - Filter by part category
 * @param {string} [filters.make] - Filter by vehicle make
 * @param {string} [filters.stockStatus] - Filter by stock status
 * @returns {Promise<Array>} Array of spare parts
 */
export async function getAllSpareParts(filters = {}) {
  const { category, make, stockStatus } = filters;

  let results;

  if (category && make && stockStatus) {
    results = await sql`
      SELECT * FROM spare_parts
      WHERE part_category = ${category}
        AND vehicle_make = ${make}
        AND stock_status = ${stockStatus}
      ORDER BY vehicle_make, vehicle_model, part_category
    `;
  } else if (category && make) {
    results = await sql`
      SELECT * FROM spare_parts
      WHERE part_category = ${category}
        AND vehicle_make = ${make}
      ORDER BY vehicle_make, vehicle_model, part_category
    `;
  } else if (category) {
    results = await sql`
      SELECT * FROM spare_parts
      WHERE part_category = ${category}
      ORDER BY vehicle_make, vehicle_model, part_category
    `;
  } else if (make) {
    results = await sql`
      SELECT * FROM spare_parts
      WHERE vehicle_make = ${make}
      ORDER BY vehicle_model, part_category
    `;
  } else {
    results = await sql`
      SELECT * FROM spare_parts
      ORDER BY vehicle_make, vehicle_model, part_category
    `;
  }

  return results;
}

/**
 * Get a single spare part by ID.
 *
 * @param {number} id - Spare part ID
 * @returns {Promise<Object|null>} The spare part object or null if not found
 */
export async function getSparePartById(id) {
  const result = await sql`
    SELECT * FROM spare_parts WHERE id = ${id}
  `;
  return result[0] || null;
}

/**
 * Get a spare part by part number.
 *
 * @param {string} partNumber - The unique part number
 * @returns {Promise<Object|null>} The spare part object or null if not found
 */
export async function getSparePartByNumber(partNumber) {
  const result = await sql`
    SELECT * FROM spare_parts WHERE part_number = ${partNumber}
  `;
  return result[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPARE PARTS MANAGEMENT (ADMIN)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add a new spare part to the catalog.
 *
 * @param {Object} part - Spare part data
 * @returns {Promise<Object>} The created spare part object
 */
export async function addSparePart(part) {
  const result = await sql`
    INSERT INTO spare_parts (
      vehicle_make, vehicle_model, year_from, year_to,
      part_number, part_category, part_description,
      price_gbp, price_usd, stock_status, compatibility_notes
    )
    VALUES (
      ${part.vehicle_make}, ${part.vehicle_model}, ${part.year_from}, ${part.year_to},
      ${part.part_number}, ${part.part_category}, ${part.part_description},
      ${part.price_gbp}, ${part.price_usd}, ${part.stock_status || 'In Stock'},
      ${part.compatibility_notes || null}
    )
    RETURNING *
  `;
  return result[0];
}

/**
 * Update an existing spare part.
 *
 * @param {number} id - Spare part ID
 * @param {Object} part - Updated spare part data
 * @returns {Promise<Object>} The updated spare part object
 */
export async function updateSparePart(id, part) {
  const result = await sql`
    UPDATE spare_parts
    SET
      vehicle_make = ${part.vehicle_make},
      vehicle_model = ${part.vehicle_model},
      year_from = ${part.year_from},
      year_to = ${part.year_to},
      part_number = ${part.part_number},
      part_category = ${part.part_category},
      part_description = ${part.part_description},
      price_gbp = ${part.price_gbp},
      price_usd = ${part.price_usd},
      stock_status = ${part.stock_status},
      compatibility_notes = ${part.compatibility_notes || null},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0];
}

/**
 * Delete a spare part from the catalog.
 *
 * @param {number} id - Spare part ID
 */
export async function deleteSparePart(id) {
  await sql`DELETE FROM spare_parts WHERE id = ${id}`;
}

/**
 * Bulk import spare parts from CSV data.
 *
 * @param {Array} parts - Array of spare part objects
 * @returns {Promise<Object>} Import results with counts
 */
export async function bulkImportSpareParts(parts) {
  let imported = 0;
  let updated = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    try {
      // Check if part already exists by part_number
      const existing = await getSparePartByNumber(part.part_number);

      if (existing) {
        // Update existing part
        await updateSparePart(existing.id, part);
        updated++;
      } else {
        // Insert new part
        await addSparePart(part);
        imported++;
      }
    } catch (err) {
      failed++;
      errors.push({
        index: i,
        partNumber: part.part_number || `Row ${i + 1}`,
        error: err.message
      });
    }
  }

  return { imported, updated, failed, errors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY AND FILTER UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all unique part categories.
 *
 * @returns {Promise<string[]>} Array of category names
 */
export async function getAllCategories() {
  const result = await sql`
    SELECT DISTINCT part_category FROM spare_parts ORDER BY part_category
  `;
  return result.map(r => r.part_category);
}

/**
 * Get all unique vehicle makes.
 *
 * @returns {Promise<string[]>} Array of vehicle makes
 */
export async function getAllMakes() {
  const result = await sql`
    SELECT DISTINCT vehicle_make FROM spare_parts ORDER BY vehicle_make
  `;
  return result.map(r => r.vehicle_make);
}

/**
 * Get all models for a specific make.
 *
 * @param {string} make - Vehicle manufacturer
 * @returns {Promise<string[]>} Array of model names
 */
export async function getModelsByMake(make) {
  const result = await sql`
    SELECT DISTINCT vehicle_model FROM spare_parts
    WHERE vehicle_make = ${make}
    ORDER BY vehicle_model
  `;
  return result.map(r => r.vehicle_model);
}

/**
 * Get spare parts count by category.
 *
 * @returns {Promise<Array>} Array of {category, count} objects
 */
export async function getCountByCategory() {
  const result = await sql`
    SELECT part_category, COUNT(*) as count
    FROM spare_parts
    GROUP BY part_category
    ORDER BY count DESC
  `;
  return result;
}

/**
 * Get spare parts count.
 *
 * @returns {Promise<number>} Total count of spare parts
 */
export async function getSparePartsCount() {
  const result = await sql`SELECT COUNT(*) as count FROM spare_parts`;
  return parseInt(result[0].count) || 0;
}
