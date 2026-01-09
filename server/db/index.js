/**
 * Database Connection Module
 *
 * This module establishes and exports the database connection for the SafeChat
 * application. It uses Neon's serverless PostgreSQL driver which is optimized
 * for serverless and edge environments.
 *
 * Connection Details:
 * - Uses Neon serverless driver for HTTP-based database access
 * - Connection string from DATABASE_URL environment variable
 * - Supports both local development and production deployment
 *
 * Why Neon Serverless:
 * - No persistent connection management needed
 * - Works well with serverless deployments (Render, Vercel, etc.)
 * - HTTP-based queries reduce cold start times
 * - Built-in connection pooling on the Neon side
 *
 * Usage:
 * Import the default export and use as a tagged template literal:
 * ```javascript
 * import sql from './db/index.js';
 * const users = await sql`SELECT * FROM users WHERE id = ${userId}`;
 * ```
 *
 * Security:
 * - Connection string should be set in environment variables, never hardcoded
 * - Template literals automatically handle SQL parameter escaping
 * - Prevents SQL injection through parameterized queries
 *
 * @module db/index
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

// ═══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load environment variables from .env file.
 * In production, these should be set by the deployment platform.
 * The .env file is for local development only and should be gitignored.
 */
dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Neon serverless SQL client instance.
 *
 * This is a tagged template literal function that executes SQL queries.
 * Parameters are automatically escaped to prevent SQL injection.
 *
 * The DATABASE_URL format:
 * postgresql://user:password@host:port/database?sslmode=require
 *
 * @example
 * // Simple query
 * const rows = await sql`SELECT * FROM users`;
 *
 * @example
 * // Parameterized query (safe from SQL injection)
 * const userId = '123';
 * const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
 *
 * @example
 * // Insert with returning
 * const newUser = await sql`
 *   INSERT INTO users (name, email)
 *   VALUES (${name}, ${email})
 *   RETURNING *
 * `;
 */
const sql = neon(process.env.DATABASE_URL);

export default sql;
