/**
 * Utility Functions
 *
 * This module provides common utility functions used throughout
 * the SafeChat client application.
 *
 * Primary Utility:
 * - cn(): Class name merger for Tailwind CSS
 *
 * The cn() function combines class names intelligently:
 * - Uses clsx for conditional class handling
 * - Uses tailwind-merge to resolve Tailwind conflicts
 *
 * @module lib/utils
 */

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// ═══════════════════════════════════════════════════════════════════════════════
// CLASS NAME UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Merge and deduplicate Tailwind CSS class names.
 *
 * This function combines multiple class name sources and intelligently
 * handles Tailwind CSS conflicts. It's the standard pattern used in
 * shadcn/ui components.
 *
 * Processing:
 * 1. clsx() handles conditional classes, arrays, and objects
 * 2. twMerge() resolves Tailwind conflicts (e.g., p-2 vs p-4)
 *
 * @param {...any} inputs - Class names, arrays, objects, or conditionals
 *   Accepts all formats that clsx supports:
 *   - Strings: "foo bar"
 *   - Objects: { foo: true, bar: false }
 *   - Arrays: ["foo", "bar"]
 *   - Nested combinations
 * @returns {string} Merged class name string
 *
 * @example
 * // Simple merge
 * cn("px-2 py-1", "px-4")  // Returns "py-1 px-4" (px-4 wins)
 *
 * @example
 * // Conditional classes
 * cn("base", isActive && "active", disabled && "opacity-50")
 *
 * @example
 * // Object syntax
 * cn("base", { "text-red": hasError, "text-green": !hasError })
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
