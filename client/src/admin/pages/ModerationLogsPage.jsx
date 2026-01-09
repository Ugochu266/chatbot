/**
 * Moderation Logs Page
 *
 * This page displays all content moderation events from the OpenAI Moderation API.
 * It shows which messages were checked, their moderation scores, and flagged categories.
 *
 * Moderation Categories (from OpenAI API):
 * - hate: Content expressing hatred towards groups
 * - harassment: Content harassing individuals
 * - self-harm: Content about self-harm
 * - sexual: Sexual content
 * - violence: Violent content
 * (Plus subcategories like hate/threatening, self-harm/intent, etc.)
 *
 * Features:
 * - Paginated table of all moderation events
 * - View detailed scores for each category
 * - Filter flagged vs passed content
 * - Role indicator (user/assistant)
 *
 * Data Flow:
 * 1. Load moderation logs with pagination
 * 2. Click "View" to see detailed breakdown
 * 3. Modal shows all category scores
 *
 * @module admin/pages/ModerationLogsPage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Bot
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { getModerationLogs } from '../../services/adminService';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Badge component showing category name and score with severity-based colors.
 *
 * @param {Object} props - Component props
 * @param {string} props.category - Moderation category name
 * @param {number} props.score - Score from 0-1
 * @returns {React.ReactElement} Colored badge with percentage
 */
function CategoryBadge({ category, score }) {
  // Determine severity based on score threshold
  const severity = score > 0.8 ? 'destructive' : score > 0.5 ? 'warning' : 'secondary';

  return (
    <Badge variant={severity} className="mr-1 mb-1">
      {category}: {(score * 100).toFixed(0)}%
    </Badge>
  );
}

/**
 * Modal dialog for viewing detailed moderation log information.
 *
 * Shows the original message, flagged categories, and all
 * category scores in a grid layout.
 *
 * @param {Object} props - Component props
 * @param {Object} props.log - Moderation log data
 * @param {boolean} props.open - Whether dialog is open
 * @param {Function} props.onClose - Close handler
 * @returns {React.ReactElement|null} Dialog component or null if no log
 */
function LogDetailDialog({ log, open, onClose }) {
  // Don't render if no log data
  if (!log) return null;

  // Extract categories and scores from log
  const categories = log.categories || {};
  const scores = log.scores || {};

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        {/* ─────────────────────────────────────────────────────────────────────
            DIALOG HEADER
            Title and pass/flag status
            ───────────────────────────────────────────────────────────────────── */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-destructive" />
            Moderation Details
          </DialogTitle>
          <DialogDescription>
            {log.flagged ? 'This content was flagged by moderation' : 'Content passed moderation'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ─────────────────────────────────────────────────────────────────
              ORIGINAL MESSAGE
              Shows the content that was moderated
              ───────────────────────────────────────────────────────────────── */}
          <div>
            <h4 className="text-sm font-medium mb-2">Message</h4>
            <div className="p-3 rounded-lg bg-muted">
              {/* Role indicator */}
              <div className="flex items-center gap-2 mb-2">
                {log.messageRole === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
                <span className="text-xs text-muted-foreground capitalize">{log.messageRole}</span>
              </div>
              {/* Message content */}
              <p className="text-sm whitespace-pre-wrap">{log.messageContent}</p>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              FLAGGED CATEGORIES
              Categories that triggered the flag
              ───────────────────────────────────────────────────────────────── */}
          <div>
            <h4 className="text-sm font-medium mb-2">Categories Detected</h4>
            <div className="flex flex-wrap gap-1">
              {Object.entries(categories).filter(([_, flagged]) => flagged).length > 0 ? (
                // Show badges for flagged categories
                Object.entries(categories)
                  .filter(([_, flagged]) => flagged)
                  .map(([category]) => (
                    <CategoryBadge
                      key={category}
                      category={category}
                      score={scores[category] || 0}
                    />
                  ))
              ) : (
                <span className="text-sm text-muted-foreground">No categories flagged</span>
              )}
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              ALL SCORES
              Grid showing all category scores
              ───────────────────────────────────────────────────────────────── */}
          <div>
            <h4 className="text-sm font-medium mb-2">All Scores</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(scores).map(([category, score]) => (
                <div key={category} className="flex justify-between">
                  <span className="text-muted-foreground">{category}</span>
                  <span className={`font-mono ${score > 0.5 ? 'text-destructive' : ''}`}>
                    {(score * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              TIMESTAMP
              When the moderation check occurred
              ───────────────────────────────────────────────────────────────── */}
          <div className="text-xs text-muted-foreground">
            <p>Logged at: {new Date(log.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main moderation logs page component.
 *
 * Displays a paginated table of moderation events with ability
 * to view detailed score breakdowns in a modal.
 *
 * @returns {React.ReactElement} Moderation logs page UI
 */
export default function ModerationLogsPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState([]);             // List of moderation logs
  const [loading, setLoading] = useState(true);     // Initial loading state
  const [page, setPage] = useState(1);              // Current page number
  const [selectedLog, setSelectedLog] = useState(null);  // Log for detail modal
  const [dialogOpen, setDialogOpen] = useState(false);   // Modal open state
  const limit = 10;  // Items per page

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Loads paginated list of moderation logs from API.
   * Memoized with useCallback to prevent unnecessary re-fetches.
   */
  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getModerationLogs(page, limit);
      setLogs(response.logs || []);
    } catch (err) {
      console.error('Failed to load moderation logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  // Reload logs when page changes
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  /**
   * Opens detail modal for a specific log entry.
   *
   * @param {Object} log - Log entry to display
   */
  const handleViewLog = (log) => {
    setSelectedLog(log);
    setDialogOpen(true);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // Show spinner on initial load
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE HEADER
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Moderation Logs</h1>
        <p className="text-muted-foreground">
          Content moderation events and flagged messages
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODERATION LOGS TABLE
          ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Moderation Events
          </CardTitle>
          <CardDescription>
            All content that has been checked by the moderation system
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            /* ─────────────────────────────────────────────────────────────────
               EMPTY STATE
               No moderation logs to display
               ───────────────────────────────────────────────────────────────── */
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No moderation logs yet</p>
            </div>
          ) : (
            <>
              {/* ─────────────────────────────────────────────────────────────────
                  DATA TABLE
                  Role, content preview, status, categories, date, actions
                  ───────────────────────────────────────────────────────────────── */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Content Preview</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    // Get list of flagged categories for display
                    const flaggedCategories = Object.entries(log.categories || {})
                      .filter(([_, flagged]) => flagged)
                      .map(([category]) => category);

                    return (
                      <TableRow key={log.id}>
                        {/* Role with icon */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {log.messageRole === 'user' ? (
                              <User className="h-4 w-4" />
                            ) : (
                              <Bot className="h-4 w-4" />
                            )}
                            <span className="capitalize text-sm">{log.messageRole}</span>
                          </div>
                        </TableCell>

                        {/* Truncated content preview */}
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {log.messageContent}
                        </TableCell>

                        {/* Pass/Flag status badge */}
                        <TableCell>
                          {log.flagged ? (
                            <Badge variant="destructive">Flagged</Badge>
                          ) : (
                            <Badge variant="secondary">Passed</Badge>
                          )}
                        </TableCell>

                        {/* Flagged categories (show first 2 + overflow count) */}
                        <TableCell className="max-w-[200px]">
                          {flaggedCategories.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {flaggedCategories.slice(0, 2).map(cat => (
                                <Badge key={cat} variant="outline" className="text-xs">
                                  {cat}
                                </Badge>
                              ))}
                              {flaggedCategories.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{flaggedCategories.length - 2}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>

                        {/* Date */}
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </TableCell>

                        {/* View action button */}
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewLog(log)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* ─────────────────────────────────────────────────────────────────
                  PAGINATION CONTROLS
                  Previous/next page buttons
                  ───────────────────────────────────────────────────────────────── */}
              <div className="flex items-center justify-end mt-4 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">Page {page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={logs.length < limit}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          LOG DETAIL MODAL
          ═══════════════════════════════════════════════════════════════════════ */}
      <LogDetailDialog
        log={selectedLog}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
