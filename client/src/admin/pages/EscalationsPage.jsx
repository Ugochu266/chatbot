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

function EscalationReasonBadge({ reason }) {
  const variants = {
    crisis: 'destructive',
    legal: 'warning',
    complaint: 'warning',
    sentiment: 'secondary',
  };
  return (
    <Badge variant={variants[reason] || 'secondary'}>
      {reason || 'Unknown'}
    </Badge>
  );
}

function ConversationDialog({ conversation, open, onClose }) {
  if (!conversation) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Escalated Conversation
          </DialogTitle>
          <DialogDescription>
            Reason: <EscalationReasonBadge reason={conversation.escalationReason} />
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[50vh] pr-4">
          <div className="space-y-4">
            {conversation.messages && conversation.messages.map((msg, index) => (
              <div
                key={msg.id || index}
                className={`flex gap-3 ${msg.role === 'user' ? '' : 'flex-row-reverse'}`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  msg.role === 'user' ? 'bg-primary' : 'bg-muted'
                }`}>
                  {msg.role === 'user' ? (
                    <User className="h-4 w-4 text-primary-foreground" />
                  ) : (
                    <Bot className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className={`flex-1 ${msg.role === 'user' ? '' : 'text-right'}`}>
                  <div className={`inline-block max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
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
        <Separator />
        <div className="text-xs text-muted-foreground">
          <p>Session ID: {conversation.sessionId}</p>
          <p>Created: {new Date(conversation.createdAt).toLocaleString()}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EscalationsPage() {
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const limit = 10;

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

  useEffect(() => {
    loadEscalations();
  }, [loadEscalations]);

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

  const totalPages = Math.ceil(total / limit);

  if (loading && escalations.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Escalations</h1>
        <p className="text-muted-foreground">
          Conversations that triggered escalation due to safety concerns
        </p>
      </div>

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
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No escalated conversations yet</p>
            </div>
          ) : (
            <>
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
                      <TableCell className="font-mono text-xs">
                        {esc.sessionId?.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <EscalationReasonBadge reason={esc.escalationReason} />
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {esc.lastMessage || 'N/A'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(esc.createdAt).toLocaleDateString()}
                      </TableCell>
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

              {/* Pagination */}
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

      <ConversationDialog
        conversation={selectedConversation}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
