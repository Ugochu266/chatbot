import React, { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import ChatContainer from './components/ChatContainer';

// Admin imports
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

function ChatApp() {
  const [conversationId, setConversationId] = useState(null);
  const [key, setKey] = useState(0);

  const handleNewChat = useCallback(() => {
    setConversationId(null);
    setKey(prev => prev + 1);
  }, []);

  const handleConversationCreate = useCallback((id) => {
    setConversationId(id);
  }, []);

  return (
    <div className="h-screen bg-slate-100 flex flex-col items-center py-4 overflow-hidden">
      <div className="w-full max-w-3xl flex-1 flex flex-col shadow-xl rounded-lg overflow-hidden mx-4" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        <Header onNewChat={handleNewChat} />
        <ChatContainer
          key={key}
          conversationId={conversationId}
          onConversationCreate={handleConversationCreate}
        />
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Main Chat App */}
        <Route path="/" element={<ChatApp />} />

        {/* Admin Routes */}
        <Route path="/admin/login" element={<LoginPage />} />
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

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
