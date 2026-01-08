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

function CategoryBadge({ category, score }) {
  const severity = score > 0.8 ? 'destructive' : score > 0.5 ? 'warning' : 'secondary';
  return (
    <Badge variant={severity} className="mr-1 mb-1">
      {category}: {(score * 100).toFixed(0)}%
    </Badge>
  );
}

function LogDetailDialog({ log, open, onClose }) {
  if (!log) return null;

  const categories = log.categories || {};
  const scores = log.scores || {};

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
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
          <div>
            <h4 className="text-sm font-medium mb-2">Message</h4>
            <div className="p-3 rounded-lg bg-muted">
              <div className="flex items-center gap-2 mb-2">
                {log.messageRole === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
                <span className="text-xs text-muted-foreground capitalize">{log.messageRole}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{log.messageContent}</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Categories Detected</h4>
            <div className="flex flex-wrap gap-1">
              {Object.entries(categories).filter(([_, flagged]) => flagged).length > 0 ? (
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

          <div className="text-xs text-muted-foreground">
            <p>Logged at: {new Date(log.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ModerationLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const limit = 10;

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

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleViewLog = (log) => {
    setSelectedLog(log);
    setDialogOpen(true);
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Moderation Logs</h1>
        <p className="text-muted-foreground">
          Content moderation events and flagged messages
        </p>
      </div>

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
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No moderation logs yet</p>
            </div>
          ) : (
            <>
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
                    const flaggedCategories = Object.entries(log.categories || {})
                      .filter(([_, flagged]) => flagged)
                      .map(([category]) => category);
                    
                    return (
                      <TableRow key={log.id}>
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
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {log.messageContent}
                        </TableCell>
                        <TableCell>
                          {log.flagged ? (
                            <Badge variant="destructive">Flagged</Badge>
                          ) : (
                            <Badge variant="secondary">Passed</Badge>
                          )}
                        </TableCell>
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
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </TableCell>
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

              {/* Pagination */}
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

      <LogDetailDialog
        log={selectedLog}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
