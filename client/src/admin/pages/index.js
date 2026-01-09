/**
 * Admin Pages Index
 *
 * This module provides a central export point for all admin page components.
 * It simplifies imports in other files by allowing multiple components
 * to be imported from a single path.
 *
 * Pages Exported:
 * - LoginPage: Admin authentication
 * - DashboardPage: Overview statistics and metrics
 * - EscalationsPage: Review escalated conversations
 * - ModerationLogsPage: View flagged content from moderation API
 * - KnowledgeBasePage: Manage RAG knowledge base documents
 *
 * Note: Some pages (RulesPage, ModerationSettingsPage, EscalationSettingsPage)
 * are imported directly from their files in App.js due to separate addition.
 *
 * @module admin/pages
 */

export { default as LoginPage } from './LoginPage';
export { default as DashboardPage } from './DashboardPage';
export { default as EscalationsPage } from './EscalationsPage';
export { default as ModerationLogsPage } from './ModerationLogsPage';
export { default as KnowledgeBasePage } from './KnowledgeBasePage';
