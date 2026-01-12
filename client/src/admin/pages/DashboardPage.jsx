/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Admin Dashboard Page
 *
 * This page provides the main overview of SafeChat system metrics and statistics.
 * It displays key performance indicators, safety metrics, and recent activity.
 *
 * Dashboard Sections:
 * - Main Stats: Conversations, messages, escalations, flagged content
 * - Performance Stats: Response time, tokens, moderation events, knowledge base
 * - Activity Timeline: 7-day bar chart showing message volume
 * - Safety Summary: Rates and percentages for safety metrics
 * - System Health: Status indicators for all safety systems
 *
 * Data Flow:
 * 1. Component mounts → Fetches stats from /api/admin/stats
 * 2. Stats are displayed across multiple card sections
 * 3. Activity timeline renders as a horizontal bar chart
 *
 * @module admin/pages/DashboardPage
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  AlertTriangle,
  Shield,
  BookOpen,
  Clock,
  Zap,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { getStats } from '../../services/adminService';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reusable statistics card component.
 *
 * Displays a single metric with optional description and trend indicator.
 *
 * @param {Object} props - Component props
 * @param {string} props.title - Card title/label
 * @param {string|number} props.value - Main metric value
 * @param {string} [props.description] - Additional context below value
 * @param {React.ComponentType} props.icon - Lucide icon component
 * @param {string} [props.trend] - Optional trend text (shows with upward arrow)
 * @returns {React.ReactElement} Stat card UI
 */
function StatCard({ title, value, description, icon: Icon, trend }) {
  return (
    <Card>
      {/* ─────────────────────────────────────────────────────────────────────────
          CARD HEADER
          Title and icon in horizontal layout
          ───────────────────────────────────────────────────────────────────────── */}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>

      {/* ─────────────────────────────────────────────────────────────────────────
          CARD CONTENT
          Main value, optional description, and trend indicator
          ───────────────────────────────────────────────────────────────────────── */}
      <CardContent>
        {/* Main metric value - large and bold */}
        <div className="text-2xl font-bold">{value}</div>

        {/* Optional description text */}
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}

        {/* Optional positive trend indicator */}
        {trend && (
          <div className="flex items-center text-xs text-green-600 mt-1">
            <TrendingUp className="h-3 w-3 mr-1" />
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main dashboard page component.
 *
 * Fetches and displays comprehensive system statistics including
 * conversations, messages, moderation events, and safety metrics.
 *
 * @returns {React.ReactElement} Dashboard page UI
 */
export default function DashboardPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState(null);       // Statistics data from API
  const [loading, setLoading] = useState(true);   // Loading state
  const [error, setError] = useState(null);       // Error message if fetch fails

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // Fetch stats on component mount
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadStats();
  }, []);

  /**
   * Fetches statistics from the admin API.
   * Updates state with stats data or error message.
   */
  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await getStats();
      setStats(response.stats);
    } catch (err) {
      setError('Failed to load statistics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // Show spinner while fetching data
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR STATE
  // Show error message if fetch failed
  // ─────────────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA EXTRACTION
  // Extract stats with defaults for missing data
  // ─────────────────────────────────────────────────────────────────────────────
  const conversations = stats?.conversations || {};
  const messages = stats?.messages || {};
  const moderation = stats?.moderation || {};
  const knowledgeBase = stats?.knowledgeBase || {};
  const dailyActivity = stats?.dailyActivity || [];

  // Calculate percentage rates for display
  const escalationRate = conversations.total > 0
    ? ((conversations.escalated / conversations.total) * 100).toFixed(1)
    : 0;

  const flaggedRate = messages.total > 0
    ? ((messages.flagged / messages.total) * 100).toFixed(2)
    : 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE HEADER
          Title and description
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of SafeChat system metrics and safety statistics
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN STATISTICS
          Conversations, messages, escalations, flagged content
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Conversations"
          value={conversations.total || 0}
          description={`${conversations.last24h || 0} in last 24h`}
          icon={MessageSquare}
        />
        <StatCard
          title="Total Messages"
          value={messages.total || 0}
          description={`${messages.user || 0} user, ${messages.assistant || 0} assistant`}
          icon={MessageSquare}
        />
        <StatCard
          title="Escalations"
          value={conversations.escalated || 0}
          description={`${escalationRate}% escalation rate`}
          icon={AlertTriangle}
        />
        <StatCard
          title="Flagged Messages"
          value={messages.flagged || 0}
          description={`${flaggedRate}% of total messages`}
          icon={Shield}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PERFORMANCE STATISTICS
          Response time, tokens, moderation, knowledge base
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Avg Response Time"
          value={`${messages.avgResponseTimeMs || 0}ms`}
          description="Time to generate response"
          icon={Clock}
        />
        <StatCard
          title="Avg Tokens Used"
          value={messages.avgTokensUsed || 0}
          description="Tokens per response"
          icon={Zap}
        />
        <StatCard
          title="Moderation Events"
          value={moderation.totalEvents || 0}
          description={`${moderation.flaggedEvents || 0} flagged`}
          icon={Shield}
        />
        <StatCard
          title="Knowledge Base"
          value={knowledgeBase.totalDocuments || 0}
          description={`${knowledgeBase.totalCategories || 0} categories`}
          icon={BookOpen}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ACTIVITY TIMELINE
          7-day horizontal bar chart showing message volume
          ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity (Last 7 Days)</CardTitle>
          <CardDescription>Daily message volume and flagged content</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyActivity.length > 0 ? (
            <div className="space-y-4">
              {dailyActivity.map((day, index) => {
                // Calculate bar width as percentage of max messages
                const maxMessages = Math.max(...dailyActivity.map(d => d.messages));
                const percentage = maxMessages > 0 ? (day.messages / maxMessages) * 100 : 0;

                // Format date for display
                const date = new Date(day.date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                });

                return (
                  <div key={index} className="flex items-center gap-4">
                    {/* Date label */}
                    <div className="w-24 text-sm text-muted-foreground">{date}</div>

                    {/* Bar chart visualization */}
                    <div className="flex-1">
                      <div className="h-4 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Message count */}
                    <div className="w-20 text-sm text-right">
                      <span className="font-medium">{day.messages}</span>
                      <span className="text-muted-foreground"> msgs</span>
                    </div>

                    {/* Flagged count (if any) */}
                    {day.flagged > 0 && (
                      <div className="w-20 text-sm text-right text-destructive">
                        {day.flagged} flagged
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No activity data available yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          SUMMARY CARDS
          Safety summary and system health status
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* ─────────────────────────────────────────────────────────────────────
            SAFETY SUMMARY
            Key safety metrics and rates
            ───────────────────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Safety Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Conversations in last 7 days</span>
              <span className="font-medium">{conversations.last7d || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Escalation rate</span>
              <span className="font-medium">{escalationRate}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Content flagging rate</span>
              <span className="font-medium">{flaggedRate}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Moderation accuracy</span>
              <span className="font-medium text-green-600">Active</span>
            </div>
          </CardContent>
        </Card>

        {/* ─────────────────────────────────────────────────────────────────────
            SYSTEM HEALTH
            Status indicators for all safety subsystems
            ───────────────────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">OpenAI Moderation</span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Active
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Input Sanitization</span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Active
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Escalation Detection</span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Active
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">RAG System</span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Active
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
