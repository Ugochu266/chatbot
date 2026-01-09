/**
 * Protected Route Component
 *
 * This component provides route protection for admin pages in SafeChat.
 * It checks if the user is authenticated before rendering the child components.
 *
 * Authentication Flow:
 * 1. Component renders
 * 2. Checks for admin key in sessionStorage
 * 3. If authenticated: Renders children (admin page)
 * 4. If not authenticated: Redirects to login page
 *
 * Note: This only checks for presence of admin key, not validity.
 * Server validates the key on each API request. If key is invalid,
 * API calls will fail with 403 and user should be redirected.
 *
 * Usage:
 * Wrap any route that requires admin authentication:
 *
 * <Route path="/admin/dashboard" element={
 *   <ProtectedRoute>
 *     <DashboardPage />
 *   </ProtectedRoute>
 * } />
 *
 * @module admin/components/ProtectedRoute
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '../../services/adminService';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Route guard component for admin authentication.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Protected content to render
 * @returns {React.ReactElement} Children if authenticated, redirect if not
 */
export default function ProtectedRoute({ children }) {
  // Check if admin key exists in sessionStorage
  if (!isAuthenticated()) {
    // Redirect to login with replace to avoid back-button issues
    return <Navigate to="/admin/login" replace />;
  }

  // Authenticated - render protected content
  return children;
}
