/**
 * Knowledge Base Management Page
 *
 * This page provides CRUD operations for managing RAG (Retrieval Augmented Generation)
 * knowledge base documents. Documents stored here are used to provide context-aware
 * responses to user queries.
 *
 * Document Structure:
 * - Title: Document identifier
 * - Category: Grouping for organization (e.g., "Returns", "Shipping")
 * - Content: The actual text content used for retrieval
 * - Keywords: Tags for improved search matching
 *
 * Features:
 * - Create, read, update, delete documents
 * - Category-based filtering
 * - Full-text search across titles and content
 * - Client-side pagination
 * - New category creation on-the-fly
 *
 * Data Flow:
 * 1. Load documents from /api/admin/knowledge-base
 * 2. Filter/search client-side for responsiveness
 * 3. CRUD operations via modal dialogs
 * 4. Confirmation dialog for deletions
 *
 * @module admin/pages/KnowledgeBasePage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  FolderOpen,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  getKnowledgeBase,
  createDocument,
  updateDocument,
  deleteDocument
} from '../../services/adminService';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Modal dialog for creating or editing knowledge base documents.
 *
 * Handles form state, validation, and submission for document CRUD operations.
 * Supports both selecting existing categories and creating new ones.
 *
 * @param {Object} props - Component props
 * @param {Object|null} props.document - Existing document to edit, or null for create
 * @param {boolean} props.open - Whether dialog is open
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.onSave - Save handler (receives form data)
 * @param {string[]} props.categories - Available category options
 * @returns {React.ReactElement} Document form dialog
 */
function DocumentDialog({ document, open, onClose, onSave, categories }) {
  // ─────────────────────────────────────────────────────────────────────────────
  // LOCAL STATE
  // Form fields and UI state
  // ─────────────────────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    content: '',
    keywords: ''
  });
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');  // For creating new categories

  // ─────────────────────────────────────────────────────────────────────────────
  // FORM INITIALIZATION
  // Populate form when document changes or dialog opens
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (document) {
      // Editing existing document - populate form
      setFormData({
        title: document.title || '',
        category: document.category || '',
        content: document.content || '',
        keywords: (document.keywords || []).join(', ')
      });
    } else {
      // Creating new document - reset form
      setFormData({ title: '', category: '', content: '', keywords: '' });
    }
    setNewCategory('');
  }, [document, open]);

  /**
   * Handles form submission.
   * Processes keywords string into array and calls onSave.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        ...formData,
        // Use new category if provided, otherwise use selected category
        category: newCategory || formData.category,
        // Split comma-separated keywords into array
        keywords: formData.keywords.split(',').map(k => k.trim()).filter(k => k)
      };
      await onSave(data);
      onClose();
    } catch (err) {
      console.error('Failed to save document:', err);
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          {/* ─────────────────────────────────────────────────────────────────
              DIALOG HEADER
              Dynamic title based on create/edit mode
              ───────────────────────────────────────────────────────────────── */}
          <DialogHeader>
            <DialogTitle>
              {document ? 'Edit Document' : 'Add Document'}
            </DialogTitle>
            <DialogDescription>
              {document
                ? 'Update the knowledge base document'
                : 'Add a new document to the knowledge base'}
            </DialogDescription>
          </DialogHeader>

          {/* ─────────────────────────────────────────────────────────────────
              FORM FIELDS
              ───────────────────────────────────────────────────────────────── */}
          <div className="space-y-4 py-4">
            {/* Title field */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(d => ({ ...d, title: e.target.value }))}
                placeholder="Document title"
                required
              />
            </div>

            {/* Category selection + new category input */}
            <div className="space-y-2">
              <Label>Category</Label>
              <div className="flex gap-2">
                {/* Existing category dropdown */}
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData(d => ({ ...d, category: val }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* New category input */}
                <Input
                  placeholder="Or new category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>

            {/* Content textarea */}
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData(d => ({ ...d, content: e.target.value }))}
                placeholder="Document content..."
                className="min-h-[200px]"
                required
              />
            </div>

            {/* Keywords input (comma-separated) */}
            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords (comma-separated)</Label>
              <Input
                id="keywords"
                value={formData.keywords}
                onChange={(e) => setFormData(d => ({ ...d, keywords: e.target.value }))}
                placeholder="return, refund, policy"
              />
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              DIALOG FOOTER
              Cancel and save buttons
              ───────────────────────────────────────────────────────────────── */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main knowledge base management page component.
 *
 * Provides a complete interface for managing RAG documents including
 * listing, searching, filtering, and CRUD operations.
 *
 * @returns {React.ReactElement} Knowledge base page UI
 */
export default function KnowledgeBasePage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [documents, setDocuments] = useState([]);        // All documents
  const [categories, setCategories] = useState([]);      // Available categories
  const [loading, setLoading] = useState(true);          // Initial loading state
  const [selectedCategory, setSelectedCategory] = useState(null);  // Category filter
  const [searchQuery, setSearchQuery] = useState('');    // Search filter
  const [editingDoc, setEditingDoc] = useState(null);    // Document being edited
  const [dialogOpen, setDialogOpen] = useState(false);   // Create/edit dialog state
  const [deleteDoc, setDeleteDoc] = useState(null);      // Document pending deletion
  const [deleting, setDeleting] = useState(false);       // Delete in progress
  const [page, setPage] = useState(1);                   // Current page number
  const limit = 10;  // Items per page

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Loads documents from API, optionally filtered by category.
   * Memoized with useCallback to prevent unnecessary re-fetches.
   */
  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getKnowledgeBase(selectedCategory);
      setDocuments(response.documents || []);
      setCategories(response.categories || []);
    } catch (err) {
      console.error('Failed to load knowledge base:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  // Reload documents when category filter changes
  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // ─────────────────────────────────────────────────────────────────────────────
  // CRUD HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Saves a document (create or update).
   * Called by DocumentDialog on form submission.
   */
  const handleSave = async (data) => {
    if (editingDoc) {
      // Update existing document
      await updateDocument(editingDoc.id, data);
    } else {
      // Create new document
      await createDocument(data);
    }
    loadDocuments();  // Refresh list
  };

  /**
   * Deletes the document pending in deleteDoc state.
   * Called when user confirms deletion dialog.
   */
  const handleDelete = async () => {
    if (!deleteDoc) return;
    setDeleting(true);
    try {
      await deleteDocument(deleteDoc.id);
      setDeleteDoc(null);
      loadDocuments();  // Refresh list
    } catch (err) {
      console.error('Failed to delete document:', err);
    } finally {
      setDeleting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CLIENT-SIDE FILTERING
  // Filter documents by search query (title and content)
  // ─────────────────────────────────────────────────────────────────────────────
  const filteredDocs = documents.filter(doc =>
    searchQuery === '' ||
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGINATION
  // Calculate pages and slice filtered results
  // ─────────────────────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(filteredDocs.length / limit);
  const paginatedDocs = filteredDocs.slice((page - 1) * limit, page * limit);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory]);

  // ─────────────────────────────────────────────────────────────────────────────
  // GROUP BY CATEGORY
  // Organize paginated documents by category for display
  // ─────────────────────────────────────────────────────────────────────────────
  const groupedDocs = paginatedDocs.reduce((acc, doc) => {
    const cat = doc.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {});

  // ─────────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading && documents.length === 0) {
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
          Title and add document button
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground">
            Manage documents used for RAG responses
          </p>
        </div>
        <Button onClick={() => { setEditingDoc(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Document
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SEARCH AND FILTER BAR
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex gap-4">
        {/* Search input with icon */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category filter dropdown */}
        <Select
          value={selectedCategory || 'all'}
          onValueChange={(val) => setSelectedCategory(val === 'all' ? null : val)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          DOCUMENT LIST
          ═══════════════════════════════════════════════════════════════════════ */}
      {documents.length === 0 ? (
        /* ─────────────────────────────────────────────────────────────────────
           EMPTY STATE
           No documents in knowledge base yet
           ───────────────────────────────────────────────────────────────────── */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No documents yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add documents to your knowledge base to enable RAG responses
            </p>
            <Button onClick={() => { setEditingDoc(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* ─────────────────────────────────────────────────────────────────
              DOCUMENTS GROUPED BY CATEGORY
              Each category gets its own card
              ───────────────────────────────────────────────────────────────── */}
          {Object.entries(groupedDocs).map(([category, docs]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FolderOpen className="h-5 w-5" />
                  {category}
                  <Badge variant="secondary">{docs.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {docs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-start justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      {/* Document info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium">{doc.title}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {doc.content}
                        </p>
                        {/* Keyword badges */}
                        {doc.keywords && doc.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {doc.keywords.slice(0, 5).map((kw, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {kw}
                              </Badge>
                            ))}
                            {doc.keywords.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{doc.keywords.length - 5}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-1 ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setEditingDoc(doc); setDialogOpen(true); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteDoc(doc)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* ─────────────────────────────────────────────────────────────────
              PAGINATION CONTROLS
              ───────────────────────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, filteredDocs.length)} of {filteredDocs.length} documents
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
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
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          CREATE/EDIT DOCUMENT DIALOG
          ═══════════════════════════════════════════════════════════════════════ */}
      <DocumentDialog
        document={editingDoc}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingDoc(null); }}
        onSave={handleSave}
        categories={categories}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          DELETE CONFIRMATION DIALOG
          ═══════════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteDoc?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
