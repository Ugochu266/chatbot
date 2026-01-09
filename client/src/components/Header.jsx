/**
 * Header Component
 *
 * This component renders the application header bar for SafeChat.
 * It displays the application branding and provides navigation actions.
 *
 * Features:
 * - Application logo and title
 * - New Chat button (clears current conversation)
 * - Admin Dashboard link
 *
 * Navigation:
 * - Plus icon: Triggers new conversation (calls onNewChat callback)
 * - Settings icon: Links to admin login page
 *
 * @module components/Header
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Plus, Settings } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Application header with branding and navigation.
 *
 * @param {Object} props - Component props
 * @param {Function} props.onNewChat - Callback to start a new conversation
 *   Clears current conversation and creates a fresh one
 * @returns {React.ReactElement} The header bar
 */
function Header({ onNewChat }) {
  return (
    <header className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
      {/* ─────────────────────────────────────────────────────────────────────────
          BRANDING
          Logo icon and application name
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        <h1 className="font-semibold text-lg">SafeChat</h1>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          NAVIGATION ACTIONS
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className="p-2 hover:bg-white/10 rounded-md transition-colors"
          title="New Chat"
        >
          <Plus className="h-5 w-5" />
        </button>

        {/* Admin Dashboard Link */}
        <Link
          to="/admin/login"
          className="p-2 hover:bg-white/10 rounded-md transition-colors"
          title="Admin Dashboard"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}

export default Header;
