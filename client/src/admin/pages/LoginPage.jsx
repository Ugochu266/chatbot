/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Admin Login Page
 *
 * This page provides the authentication interface for the SafeChat admin dashboard.
 * Admins enter their API key which is verified against the server before granting access.
 *
 * Authentication Flow:
 * 1. Admin enters their key
 * 2. Key is validated (min 8 characters)
 * 3. Key is verified with server via /api/admin/stats
 * 4. If valid: Key is stored in sessionStorage, redirect to dashboard
 * 5. If invalid: Error message displayed
 *
 * Security Notes:
 * - Key is stored in sessionStorage (clears on browser close)
 * - Key is sent as X-Admin-Key header on subsequent requests
 * - Verification uses the stats endpoint as a health check
 *
 * Features:
 * - Password input for key entry
 * - Client-side validation (min length)
 * - Server-side verification
 * - Loading state during verification
 * - Error message display
 * - Back to chat navigation
 *
 * @module admin/pages/LoginPage
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { setAdminKey, verifyAdminKey } from '../../services/adminService';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Admin login form component.
 *
 * Renders a centered card with admin key input and handles
 * the authentication flow.
 *
 * @returns {React.ReactElement} The login page UI
 */
export default function LoginPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [adminKey, setAdminKeyInput] = useState('');  // Input value
  const [error, setError] = useState('');              // Error message
  const [loading, setLoading] = useState(false);       // Verification in progress
  const navigate = useNavigate();

  // ─────────────────────────────────────────────────────────────────────────────
  // FORM SUBMISSION
  // Validates and verifies the admin key
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // ─────────────────────────────────────────────────────────────────────────
    // CLIENT-SIDE VALIDATION
    // Basic validation before making API call
    // ─────────────────────────────────────────────────────────────────────────
    if (adminKey.length < 8) {
      setError('Admin key must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      // ─────────────────────────────────────────────────────────────────────────
      // SERVER VERIFICATION
      // Verify key against server before storing
      // ─────────────────────────────────────────────────────────────────────────
      const isValid = await verifyAdminKey(adminKey);

      if (isValid) {
        // Success - store key and redirect to dashboard
        setAdminKey(adminKey);
        navigate('/admin');
      } else {
        // Invalid key
        setError('Invalid admin key');
      }
    } catch (err) {
      // Network or server error
      setError('Failed to verify admin key. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        {/* ─────────────────────────────────────────────────────────────────────
            HEADER
            Logo, title, and description
            ───────────────────────────────────────────────────────────────────── */}
        <CardHeader className="text-center">
          {/* Shield icon */}
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Admin Login</CardTitle>
          <CardDescription>
            Enter your admin key to access the SafeChat admin dashboard
          </CardDescription>
        </CardHeader>

        {/* ─────────────────────────────────────────────────────────────────────
            LOGIN FORM
            ───────────────────────────────────────────────────────────────────── */}
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Admin Key Input */}
            <div className="space-y-2">
              <Label htmlFor="adminKey">Admin Key</Label>
              <Input
                id="adminKey"
                type="password"
                placeholder="Enter admin key..."
                value={adminKey}
                onChange={(e) => setAdminKeyInput(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Submit Button */}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Login'
              )}
            </Button>
          </form>

          {/* Back to Chat Link */}
          <div className="mt-4 text-center">
            <Button variant="link" onClick={() => navigate('/')}>
              Back to Chat
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
