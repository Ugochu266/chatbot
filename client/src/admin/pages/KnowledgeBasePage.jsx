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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Upload,
  FileJson,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2
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
import { Progress } from '../../components/ui/progress';
import {
  getKnowledgeBase,
  createDocument,
  updateDocument,
  deleteDocument,
  bulkImportDocuments
} from '../../services/adminService';

// ═══════════════════════════════════════════════════════════════════════════════
// CHUNKED UPLOAD UTILITIES
// Splits large datasets into smaller batches for reliable upload
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Split an array into chunks of specified size.
 * This enables uploading large datasets without hitting payload limits.
 *
 * @param {Array} array - The array to split
 * @param {number} chunkSize - Maximum items per chunk
 * @returns {Array<Array>} Array of chunks
 */
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Upload data in chunks with progress tracking.
 * Processes each chunk sequentially and accumulates results.
 *
 * @param {Array} items - All items to upload
 * @param {Function} uploadFn - Function to call for each chunk
 * @param {Function} onProgress - Callback with progress (0-100)
 * @param {number} chunkSize - Items per chunk (default: 50)
 * @returns {Promise<Object>} Accumulated results
 */
async function uploadInChunks(items, uploadFn, onProgress, chunkSize = 50) {
  const chunks = chunkArray(items, chunkSize);
  const totalChunks = chunks.length;

  // Accumulated results
  const results = {
    success: true,
    imported: 0,
    failed: 0,
    errors: [],
    message: ''
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      const chunkResult = await uploadFn(chunk);

      // Accumulate results
      results.imported += chunkResult.imported || 0;
      results.failed += chunkResult.failed || 0;

      if (chunkResult.errors) {
        results.errors.push(...chunkResult.errors);
      }
    } catch (error) {
      // Mark all items in failed chunk as failed
      results.failed += chunk.length;
      results.errors.push({ title: `Chunk ${i + 1}`, error: error.message });
      results.success = false;
    }

    // Update progress (0-100)
    const progress = Math.round(((i + 1) / totalChunks) * 100);
    onProgress(progress, i + 1, totalChunks);
  }

  // Set final message
  if (results.imported > 0 && results.failed === 0) {
    results.message = `Successfully imported ${results.imported} documents`;
  } else if (results.imported > 0) {
    results.message = `Imported ${results.imported} documents with ${results.failed} failures`;
    results.success = results.failed < results.imported; // Partial success
  } else {
    results.message = `Import failed: ${results.failed} documents could not be imported`;
    results.success = false;
  }

  return results;
}

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
// FILE IMPORT DIALOG
// Handles JSON/CSV file upload and bulk import
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a single CSV line handling quoted values with commas inside.
 *
 * @param {string} line - CSV line to parse
 * @returns {string[]} Array of column values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim()); // Last value
  return values;
}

/**
 * Parse CSV text into array of document objects.
 *
 * Supports two formats:
 * 1. Standard: title, category, content, keywords columns
 * 2. Spare Parts: vehicle_make, vehicle_model, part_number, part_category,
 *    part_description, price_*, stock_status, compatibility_notes
 *
 * Auto-detects format based on column headers and transforms accordingly.
 *
 * @param {string} csvText - Raw CSV text content
 * @returns {Array} Array of parsed document objects
 */
function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return []; // Need header + at least one row

  // Parse header row
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  // Detect format: check for spare parts specific columns
  const isSparePartsFormat = headers.includes('part_number') ||
                             headers.includes('vehicle_make') ||
                             headers.includes('part_description');

  if (isSparePartsFormat) {
    return parseSparePartsCSV(headers, lines);
  }

  // Standard format: title, category, content, keywords
  const titleIdx = headers.indexOf('title');
  const categoryIdx = headers.indexOf('category');
  const contentIdx = headers.indexOf('content');
  const keywordsIdx = headers.indexOf('keywords');

  // Validate required columns exist
  if (titleIdx === -1 || categoryIdx === -1 || contentIdx === -1) {
    throw new Error('CSV must have title, category, and content columns (or use spare parts format with part_number, vehicle_make, etc.)');
  }

  // Parse data rows
  const documents = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    if (values.length >= 3) {
      documents.push({
        title: values[titleIdx] || '',
        category: values[categoryIdx] || '',
        content: values[contentIdx] || '',
        keywords: keywordsIdx !== -1 && values[keywordsIdx]
          ? values[keywordsIdx].split(';').map(k => k.trim()).filter(k => k)
          : []
      });
    }
  }

  return documents;
}

/**
 * Parse spare parts CSV format into knowledge base documents.
 * Transforms vehicle/part data into searchable content documents.
 *
 * @param {string[]} headers - Column headers
 * @param {string[]} lines - All CSV lines including header
 * @returns {Array} Array of document objects
 */
function parseSparePartsCSV(headers, lines) {
  // Map column indices
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[h] = i; });

  const documents = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 3) continue;

    // Extract values with fallbacks
    const get = (col) => (colIdx[col] !== undefined ? values[colIdx[col]] : '') || '';

    const vehicleMake = get('vehicle_make');
    const vehicleModel = get('vehicle_model');
    const yearFrom = get('year_from');
    const yearTo = get('year_to');
    const partNumber = get('part_number');
    const partCategory = get('part_category');
    const partDescription = get('part_description');
    const priceGbp = get('price_gbp');
    const priceUsd = get('price_usd');
    const stockStatus = get('stock_status');
    const compatNotes = get('compatibility_notes');

    // Build document title
    const title = partDescription
      ? `${partDescription} (${partNumber})`
      : partNumber || `Part ${i}`;

    // Category: use part category or vehicle make
    const category = partCategory || vehicleMake || 'Spare Parts';

    // Build rich content for RAG retrieval
    const contentParts = [];
    if (partDescription) contentParts.push(partDescription);
    if (partNumber) contentParts.push(`Part Number: ${partNumber}`);
    if (vehicleMake && vehicleModel) {
      const years = yearFrom && yearTo ? ` (${yearFrom}-${yearTo})` : '';
      contentParts.push(`Fits: ${vehicleMake} ${vehicleModel}${years}`);
    }
    if (priceGbp || priceUsd) {
      const prices = [];
      if (priceGbp) prices.push(`£${priceGbp}`);
      if (priceUsd) prices.push(`$${priceUsd}`);
      contentParts.push(`Price: ${prices.join(' / ')}`);
    }
    if (stockStatus) contentParts.push(`Availability: ${stockStatus}`);
    if (compatNotes) contentParts.push(`Notes: ${compatNotes}`);

    const content = contentParts.join('. ');

    // Build keywords for search
    const keywords = [
      vehicleMake,
      vehicleModel,
      partNumber,
      partCategory,
      stockStatus
    ].filter(k => k && k.trim());

    // Add part description words as keywords
    if (partDescription) {
      const descWords = partDescription.split(/[\s-]+/).filter(w => w.length > 3);
      keywords.push(...descWords.slice(0, 5));
    }

    documents.push({
      title,
      category,
      content,
      keywords: [...new Set(keywords)] // Remove duplicates
    });
  }

  return documents;
}

/**
 * Modal dialog for importing documents from JSON or CSV files.
 *
 * Supports:
 * - JSON: Array of objects with title, category, content, keywords
 * - CSV: Columns for title, category, content, keywords (semicolon-separated)
 *
 * @param {Object} props - Component props
 * @param {boolean} props.open - Whether dialog is open
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.onImportComplete - Called after successful import
 * @returns {React.ReactElement} Import dialog
 */
function ImportDialog({ open, onClose, onImportComplete }) {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [parsedData, setParsedData] = useState([]);    // Parsed documents
  const [parseError, setParseError] = useState('');    // Parsing error message
  const [importing, setImporting] = useState(false);   // Import in progress
  const [importResult, setImportResult] = useState(null); // Import result
  const [fileName, setFileName] = useState('');        // Selected file name
  const [progress, setProgress] = useState(0);         // Upload progress (0-100)
  const [progressText, setProgressText] = useState(''); // Progress status text
  const fileInputRef = useRef(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setParsedData([]);
      setParseError('');
      setImportResult(null);
      setFileName('');
      setProgress(0);
      setProgressText('');
    }
  }, [open]);

  // ─────────────────────────────────────────────────────────────────────────────
  // FILE HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handle file selection and parsing.
   * Detects file type from extension and parses accordingly.
   */
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError('');
    setParsedData([]);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        let documents;

        if (file.name.endsWith('.json')) {
          // Parse JSON file
          const json = JSON.parse(text);
          documents = Array.isArray(json) ? json : [json];
        } else if (file.name.endsWith('.csv')) {
          // Parse CSV file
          documents = parseCSV(text);
        } else {
          throw new Error('Unsupported file type. Use .json or .csv files.');
        }

        // Validate parsed documents
        if (documents.length === 0) {
          throw new Error('No valid documents found in file');
        }

        // Check for required fields
        const invalid = documents.filter(d => !d.title || !d.category || !d.content);
        if (invalid.length > 0) {
          throw new Error(`${invalid.length} document(s) missing required fields (title, category, content)`);
        }

        setParsedData(documents);
      } catch (err) {
        setParseError(err.message);
        setParsedData([]);
      }
    };

    reader.onerror = () => {
      setParseError('Failed to read file');
    };

    reader.readAsText(file);
  };

  /**
   * Import parsed documents to the knowledge base using chunked uploads.
   * This algorithm splits large datasets into smaller batches to avoid
   * payload size limits and provides progress feedback.
   */
  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setImporting(true);
    setProgress(0);
    setProgressText('Starting import...');

    try {
      // Use chunked upload for large files (clever algorithm)
      // Chunk size of 50 keeps each request small (~50-100KB)
      const result = await uploadInChunks(
        parsedData,
        bulkImportDocuments,
        (pct, currentChunk, totalChunks) => {
          setProgress(pct);
          setProgressText(`Processing chunk ${currentChunk} of ${totalChunks}...`);
        },
        50 // 50 documents per chunk
      );

      setImportResult(result);
      setProgressText('Import complete!');

      // If any imports succeeded, notify parent to refresh
      if (result.imported > 0) {
        onImportComplete();
      }
    } catch (err) {
      setImportResult({
        success: false,
        imported: 0,
        failed: parsedData.length,
        message: err.message || 'Import failed'
      });
    } finally {
      setImporting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Documents
          </DialogTitle>
          <DialogDescription>
            Upload a JSON or CSV file to bulk import documents to the knowledge base
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* ─────────────────────────────────────────────────────────────────
              FILE FORMAT INFO
              ───────────────────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg border bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <FileJson className="h-4 w-4 text-blue-500" />
                  <span className="font-medium text-sm">JSON Format</span>
                </div>
                <pre className="text-xs text-muted-foreground overflow-x-auto">
{`[{
  "title": "Part Name",
  "category": "Brakes",
  "content": "Description...",
  "keywords": ["keyword1"]
}]`}
                </pre>
              </div>
              <div className="p-3 rounded-lg border bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-sm">CSV - Standard</span>
                </div>
                <pre className="text-xs text-muted-foreground overflow-x-auto">
{`title,category,content,keywords
Part A,Brakes,Desc...,key1;key2`}
                </pre>
              </div>
            </div>
            <div className="p-3 rounded-lg border bg-green-500/10">
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="h-4 w-4 text-green-500" />
                <span className="font-medium text-sm">CSV - Spare Parts Format (Auto-detected)</span>
              </div>
              <pre className="text-xs text-muted-foreground overflow-x-auto">
{`vehicle_make,vehicle_model,year_from,year_to,part_number,part_category,part_description,price_gbp,price_usd,stock_status,compatibility_notes`}
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Auto-transforms into searchable knowledge base entries with vehicle, pricing, and availability info.
              </p>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              FILE INPUT
              ───────────────────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>Select File</Label>
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                onChange={handleFileSelect}
                className="flex-1"
              />
            </div>
            {fileName && !parseError && !importResult && (
              <p className="text-sm text-muted-foreground">
                Selected: {fileName}
              </p>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              PARSE ERROR
              ───────────────────────────────────────────────────────────────── */}
          {parseError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{parseError}</span>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              PARSED DATA PREVIEW
              ───────────────────────────────────────────────────────────────── */}
          {parsedData.length > 0 && !importResult && (
            <div className="space-y-2">
              <Label>Preview ({parsedData.length} documents)</Label>
              <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Title</th>
                      <th className="text-left p-2">Category</th>
                      <th className="text-left p-2">Content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((doc, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 font-medium truncate max-w-[150px]">{doc.title}</td>
                        <td className="p-2">
                          <Badge variant="outline">{doc.category}</Badge>
                        </td>
                        <td className="p-2 text-muted-foreground truncate max-w-[200px]">
                          {doc.content.substring(0, 50)}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-2 border-t">
                    ... and {parsedData.length - 10} more documents
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              PROGRESS BAR (shown during import)
              ───────────────────────────────────────────────────────────────── */}
          {importing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{progressText}</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} max={100} />
              <p className="text-xs text-muted-foreground text-center">
                Uploading in chunks to handle large files...
              </p>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              IMPORT RESULT
              ───────────────────────────────────────────────────────────────── */}
          {importResult && (
            <div className={`p-4 rounded-lg ${importResult.success ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
              <div className="flex items-center gap-2 mb-2">
                {importResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                )}
                <span className="font-medium">
                  {importResult.message}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Imported: {importResult.imported.toLocaleString()}</p>
                {importResult.failed > 0 && (
                  <p>Failed: {importResult.failed.toLocaleString()}</p>
                )}
              </div>
              {importResult.errors?.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-destructive">View errors ({importResult.errors.length})</summary>
                  <ul className="list-disc list-inside mt-1 max-h-24 overflow-y-auto">
                    {importResult.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err.title}: {err.error}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>...and {importResult.errors.length - 10} more</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────────────
            DIALOG FOOTER
            ───────────────────────────────────────────────────────────────────── */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>
            {importResult ? 'Close' : 'Cancel'}
          </Button>
          {!importResult && (
            <Button
              onClick={handleImport}
              disabled={parsedData.length === 0 || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {parsedData.length.toLocaleString()} Documents
                </>
              )}
            </Button>
          )}
        </DialogFooter>
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
  const [importDialogOpen, setImportDialogOpen] = useState(false); // Import dialog state
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import File
          </Button>
          <Button onClick={() => { setEditingDoc(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Document
          </Button>
        </div>
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
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import from File
              </Button>
              <Button onClick={() => { setEditingDoc(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Document
              </Button>
            </div>
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

      {/* ═══════════════════════════════════════════════════════════════════════
          FILE IMPORT DIALOG
          ═══════════════════════════════════════════════════════════════════════ */}
      <ImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImportComplete={loadDocuments}
      />
    </div>
  );
}
