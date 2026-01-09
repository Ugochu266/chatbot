/**
 * Main Application Component
 *
 * This is the root component for SafeChat that handles routing and
 * overall application structure. It defines two main areas:
 *
 * 1. Chat Application (/)
 *    - Main customer-facing chat interface
 *    - Conversation management
 *
 * 2. Admin Dashboard (/admin/*)
 *    - Protected routes requiring authentication
 *    - Safety rules, escalations, moderation management
 *
 * Route Structure:
 * - / - Main chat interface
 * - /admin/login - Admin authentication
 * - /admin - Dashboard with statistics
 * - /admin/escalations - Escalated conversation queue
 * - /admin/moderation - Moderation log viewer
 * - /admin/knowledge-base - Knowledge base management
 * - /admin/rules - Safety rules configuration
 * - /admin/moderation-settings - Moderation threshold config
 * - /admin/escalation-settings - Escalation category config
 *
 * Authentication:
 * Admin routes are wrapped in ProtectedRoute component which
 * redirects to login if not authenticated.
 *
 * @module App
 */

import React, { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import ChatContainer from './components/ChatContainer';

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

import AdminLayout from './admin/components/AdminLayout';
import ProtectedRoute from './admin/components/ProtectedRoute';
import {
  LoginPage,
  DashboardPage,
  EscalationsPage,
  ModerationLogsPage,
  KnowledgeBasePage
} from './admin/pages';
import RulesPage from './admin/pages/RulesPage';
import ModerationSettingsPage from './admin/pages/ModerationSettingsPage';
import EscalationSettingsPage from './admin/pages/EscalationSettingsPage';
import SparePartsPage from './admin/pages/SparePartsPage';

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT APPLICATION COMPONENT
// Main customer-facing chat interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main chat interface wrapper component.
 *
 * Manages the conversation state and provides the chat UI.
 * Uses a key prop on ChatContainer to force remount on new chat.
 *
 * @returns {React.ReactElement} The chat application UI
 */
function ChatApp() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [conversationId, setConversationId] = useState(null);  // Active conversation
  const [key, setKey] = useState(0);  // Key to force ChatContainer remount

  // ─────────────────────────────────────────────────────────────────────────────
  // NEW CHAT HANDLER
  // Clears conversation and increments key to force fresh ChatContainer
  // ─────────────────────────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    setConversationId(null);
    setKey(prev => prev + 1);  // Increment key to force remount
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // CONVERSATION CREATE HANDLER
  // Called when ChatContainer creates a new conversation
  // ─────────────────────────────────────────────────────────────────────────────
  const handleConversationCreate = useCallback((id) => {
    setConversationId(id);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // Centered card layout with header and chat container
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-slate-100 flex flex-col items-center py-4 overflow-hidden">
      <div className="w-full max-w-3xl flex-1 flex flex-col shadow-xl rounded-lg overflow-hidden mx-4" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        <Header onNewChat={handleNewChat} />
        <ChatContainer
          key={key}  // Changes key to force fresh instance
          conversationId={conversationId}
          onConversationCreate={handleConversationCreate}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APPLICATION COMPONENT
// Router configuration with all routes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Root application component with routing.
 *
 * Configures React Router with all application routes including
 * the main chat interface and protected admin routes.
 *
 * @returns {React.ReactElement} The routed application
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ─────────────────────────────────────────────────────────────────────
            MAIN CHAT APPLICATION
            Public route for customer chat interface
            ───────────────────────────────────────────────────────────────────── */}
        <Route path="/" element={<ChatApp />} />

        {/* ─────────────────────────────────────────────────────────────────────
            ADMIN ROUTES
            Protected routes requiring admin authentication
            ───────────────────────────────────────────────────────────────────── */}

        {/* Login Page - Public */}
        <Route path="/admin/login" element={<LoginPage />} />

        {/* Dashboard - Admin home with statistics */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <DashboardPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Escalations - Review escalated conversations */}
        <Route
          path="/admin/escalations"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <EscalationsPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Moderation Logs - View flagged content */}
        <Route
          path="/admin/moderation"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <ModerationLogsPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Knowledge Base - Manage RAG documents */}
        <Route
          path="/admin/knowledge-base"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <KnowledgeBasePage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Spare Parts - Manage vehicle spare parts catalog */}
        <Route
          path="/admin/spare-parts"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <SparePartsPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Safety Rules - Configure content filtering rules */}
        <Route
          path="/admin/rules"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <RulesPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Moderation Settings - Configure OpenAI moderation thresholds */}
        <Route
          path="/admin/moderation-settings"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <ModerationSettingsPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Escalation Settings - Configure escalation categories */}
        <Route
          path="/admin/escalation-settings"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <EscalationSettingsPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* ─────────────────────────────────────────────────────────────────────
            CATCH-ALL REDIRECT
            Any unknown route redirects to home
            ───────────────────────────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
