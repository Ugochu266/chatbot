/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Escalations Page
 *
 * This page displays conversations that have been escalated due to safety concerns.
 * Admins can review escalated conversations and view full message history.
 *
 * Escalation Types:
 * - Crisis: Mental health or self-harm indicators (highest priority)
 * - Legal: Legal threats or lawyer mentions
 * - Complaint: Customer complaints or escalation requests
 * - Sentiment: Highly negative emotional content
 *
 * Features:
 * - Paginated table of escalated conversations
 * - View full conversation in modal dialog
 * - Badge colors based on escalation reason severity
 * - Session ID tracking for identification
 *
 * Data Flow:
 * 1. Load escalation list with pagination
 * 2. Click "View" to fetch full conversation details
 * 3. Display conversation in modal with all messages
 *
 * @module admin/pages/EscalationsPage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Bot,
  Clock
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Separator } from '../../components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { getEscalations, getEscalation } from '../../services/adminService';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Badge component for displaying escalation reason with severity-based colors.
 *
 * @param {Object} props - Component props
 * @param {string} props.reason - Escalation reason (crisis, legal, complaint, sentiment)
 * @returns {React.ReactElement} Colored badge
 */
function EscalationReasonBadge({ reason }) {
  // Map escalation reasons to badge color variants
  const variants = {
    crisis: 'destructive',     // Red - highest severity
    legal: 'warning',          // Orange - high severity
    complaint: 'warning',      // Orange - medium severity
    sentiment: 'secondary',    // Gray - lower severity
  };

  return (
    <Badge variant={variants[reason] || 'secondary'}>
      {reason || 'Unknown'}
    </Badge>
  );
}

/**
 * Modal dialog for viewing full escalated conversation.
 *
 * Displays all messages in the conversation with timestamps,
 * role indicators, and flagged message highlighting.
 *
 * @param {Object} props - Component props
 * @param {Object} props.conversation - Full conversation data with messages
 * @param {boolean} props.open - Whether dialog is open
 * @param {Function} props.onClose - Close handler
 * @returns {React.ReactElement|null} Dialog component or null if no conversation
 */
function ConversationDialog({ conversation, open, onClose }) {
  // Don't render if no conversation data
  if (!conversation) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        {/* ─────────────────────────────────────────────────────────────────────
            DIALOG HEADER
            Title with alert icon and escalation reason
            ───────────────────────────────────────────────────────────────────── */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Escalated Conversation
          </DialogTitle>
          <DialogDescription>
            Reason: <EscalationReasonBadge reason={conversation.escalationReason} />
          </DialogDescription>
        </DialogHeader>

        {/* ─────────────────────────────────────────────────────────────────────
            MESSAGE LIST
            Scrollable area with all conversation messages
            ───────────────────────────────────────────────────────────────────── */}
        <ScrollArea className="h-[50vh] pr-4">
          <div className="space-y-4">
            {conversation.messages && conversation.messages.map((msg, index) => (
              <div
                key={msg.id || index}
                className={`flex gap-3 ${msg.role === 'user' ? '' : 'flex-row-reverse'}`}
              >
                {/* Avatar icon - user or bot */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  msg.role === 'user' ? 'bg-primary' : 'bg-muted'
                }`}>
                  {msg.role === 'user' ? (
                    <User className="h-4 w-4 text-primary-foreground" />
                  ) : (
                    <Bot className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {/* Message content and metadata */}
                <div className={`flex-1 ${msg.role === 'user' ? '' : 'text-right'}`}>
                  {/* Message bubble */}
                  <div className={`inline-block max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>

                  {/* Timestamp and flagged indicator */}
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(msg.createdAt).toLocaleString()}
                    {msg.flagged && (
                      <Badge variant="destructive" className="text-xs">Flagged</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* ─────────────────────────────────────────────────────────────────────
            DIALOG FOOTER
            Session ID and creation timestamp
            ───────────────────────────────────────────────────────────────────── */}
        <Separator />
        <div className="text-xs text-muted-foreground">
          <p>Session ID: {conversation.sessionId}</p>
          <p>Created: {new Date(conversation.createdAt).toLocaleString()}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main escalations page component.
 *
 * Displays a paginated table of escalated conversations with
 * ability to view full conversation details in a modal.
 *
 * @returns {React.ReactElement} Escalations page UI
 */
export default function EscalationsPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [escalations, setEscalations] = useState([]);           // List of escalations
  const [loading, setLoading] = useState(true);                  // Initial loading state
  const [page, setPage] = useState(1);                           // Current page number
  const [total, setTotal] = useState(0);                         // Total escalation count
  const [selectedConversation, setSelectedConversation] = useState(null);  // Conversation for modal
  const [dialogOpen, setDialogOpen] = useState(false);           // Modal open state
  const [loadingConversation, setLoadingConversation] = useState(false);   // Loading conversation detail
  const limit = 10;  // Items per page

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Loads paginated list of escalations from API.
   * Memoized with useCallback to prevent unnecessary re-fetches.
   */
  const loadEscalations = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getEscalations(page, limit);
      setEscalations(response.escalations || []);
      setTotal(response.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to load escalations:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  // Reload escalations when page changes
  useEffect(() => {
    loadEscalations();
  }, [loadEscalations]);

  /**
   * Fetches and displays full conversation details in modal.
   *
   * @param {string} id - Conversation ID to fetch
   */
  const handleViewConversation = async (id) => {
    try {
      setLoadingConversation(true);
      const response = await getEscalation(id);
      setSelectedConversation(response.conversation);
      setDialogOpen(true);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoadingConversation(false);
    }
  };

  // Calculate total pages for pagination
  const totalPages = Math.ceil(total / limit);

  // ─────────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // Show spinner on initial load
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading && escalations.length === 0) {
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
        <h1 className="text-3xl font-bold tracking-tight">Escalations</h1>
        <p className="text-muted-foreground">
          Conversations that triggered escalation due to safety concerns
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ESCALATIONS TABLE
          ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Escalated Conversations
          </CardTitle>
          <CardDescription>
            {total} total escalated conversations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {escalations.length === 0 ? (
            /* ─────────────────────────────────────────────────────────────────
               EMPTY STATE
               No escalations to display
               ───────────────────────────────────────────────────────────────── */
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No escalated conversations yet</p>
            </div>
          ) : (
            <>
              {/* ─────────────────────────────────────────────────────────────────
                  DATA TABLE
                  Session, reason, message preview, date, actions
                  ───────────────────────────────────────────────────────────────── */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Last Message</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {escalations.map((esc) => (
                    <TableRow key={esc.id}>
                      {/* Truncated session ID */}
                      <TableCell className="font-mono text-xs">
                        {esc.sessionId?.slice(0, 8)}...
                      </TableCell>

                      {/* Escalation reason badge */}
                      <TableCell>
                        <EscalationReasonBadge reason={esc.escalationReason} />
                      </TableCell>

                      {/* Truncated last message preview */}
                      <TableCell className="max-w-[300px] truncate">
                        {esc.lastMessage || 'N/A'}
                      </TableCell>

                      {/* Creation date */}
                      <TableCell className="text-muted-foreground">
                        {new Date(esc.createdAt).toLocaleDateString()}
                      </TableCell>

                      {/* View action button */}
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewConversation(esc.id)}
                          disabled={loadingConversation}
                        >
                          {loadingConversation ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* ─────────────────────────────────────────────────────────────────
                  PAGINATION CONTROLS
                  Previous/next page buttons
                  ───────────────────────────────────────────────────────────────── */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p - 1)}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          CONVERSATION DETAIL MODAL
          ═══════════════════════════════════════════════════════════════════════ */}
      <ConversationDialog
        conversation={selectedConversation}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
