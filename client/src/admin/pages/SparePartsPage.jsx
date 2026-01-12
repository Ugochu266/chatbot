/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Spare Parts Management Page
 *
 * This page allows admins to manage the vehicle spare parts catalog.
 * The spare parts data is used for RAG (Retrieval-Augmented Generation)
 * when users ask about parts, pricing, availability, etc.
 *
 * Features:
 * - View all spare parts with filtering by category/make
 * - Add/edit/delete individual parts
 * - Bulk import from CSV files
 * - Search parts using RAG algorithm
 *
 * CSV Format (exact columns required):
 * vehicle_make, vehicle_model, year_from, year_to, part_number,
 * part_category, part_description, price_gbp, price_usd,
 * stock_status, compatibility_notes
 *
 * @module admin/pages/SparePartsPage
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Search,
  Loader2,
  FileText,
  AlertCircle,
  CheckCircle2,
  Car,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '../../components/ui/alert';
import { Progress } from '../../components/ui/progress';
import {
  getSpareParts,
  createSparePart,
  updateSparePart,
  deleteSparePart,
  searchSpareParts,
  bulkImportSpareParts,
  bulkDeleteSpareParts,
  bulkUpdateSparePartsStatus
} from '../../services/adminService';
import { Checkbox } from '../../components/ui/checkbox';
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
    imported: 0,
    updated: 0,
    failed: 0,
    errors: []
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      const chunkResult = await uploadFn(chunk);

      // Accumulate results
      results.imported += chunkResult.imported || 0;
      results.updated += chunkResult.updated || 0;
      results.failed += chunkResult.failed || 0;

      if (chunkResult.errors) {
        results.errors.push(...chunkResult.errors);
      }
    } catch (error) {
      // Mark all items in failed chunk as failed
      results.failed += chunk.length;
      results.errors.push(`Chunk ${i + 1} failed: ${error.message}`);
    }

    // Update progress (0-100)
    const progress = Math.round(((i + 1) / totalChunks) * 100);
    onProgress(progress, i + 1, totalChunks);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSV PARSING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a single CSV line handling quoted values with commas.
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

/**
 * Parse CSV content into array of spare part objects.
 * Expects exact CSV column format.
 */
function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row');
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

  // Validate required columns
  const requiredColumns = [
    'vehicle_make', 'vehicle_model', 'year_from', 'year_to',
    'part_number', 'part_category', 'part_description',
    'price_gbp', 'price_usd'
  ];

  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
  }

  const parts = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;

    const part = {};
    headers.forEach((header, index) => {
      let value = values[index];

      // Convert numeric fields
      if (header === 'year_from' || header === 'year_to') {
        value = parseInt(value) || 0;
      } else if (header === 'price_gbp' || header === 'price_usd') {
        value = parseFloat(value) || 0;
      }

      part[header] = value;
    });

    parts.push(part);
  }

  return parts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT DIALOG COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function ImportDialog({ open, onClose, onImport }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [totalParts, setTotalParts] = useState(0);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const fileInputRef = useRef(null);
  const parsedPartsRef = useRef([]);
  // Track current file to prevent race condition when user selects multiple files quickly
  const currentFileRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setError('');
    setResult(null);
    setPreview([]);
    setTotalParts(0);
    setProgress(0);
    setProgressText('');
    parsedPartsRef.current = [];

    if (selectedFile) {
      // Track this file as the current one being processed
      const fileId = `${selectedFile.name}-${selectedFile.lastModified}`;
      currentFileRef.current = fileId;

      const reader = new FileReader();
      reader.onload = (event) => {
        // Only process if this is still the current file (prevents race condition)
        if (currentFileRef.current !== fileId) return;

        try {
          const parts = parseCSV(event.target.result);
          parsedPartsRef.current = parts;
          setTotalParts(parts.length);
          setPreview(parts.slice(0, 5));
        } catch (err) {
          setError(err.message);
        }
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file || parsedPartsRef.current.length === 0) return;

    setImporting(true);
    setError('');
    setProgress(0);
    setProgressText('Starting import...');

    try {
      const parts = parsedPartsRef.current;

      // Use chunked upload for large files (clever algorithm)
      // Chunk size of 50 keeps each request small (~50KB)
      const importResult = await uploadInChunks(
        parts,
        bulkImportSpareParts,
        (pct, currentChunk, totalChunks) => {
          setProgress(pct);
          setProgressText(`Processing chunk ${currentChunk} of ${totalChunks}...`);
        },
        50 // 50 items per chunk
      );

      setResult(importResult);
      setProgressText('Import complete!');

      if (importResult.imported > 0 || importResult.updated > 0) {
        onImport();
      }
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setTotalParts(0);
    setError('');
    setResult(null);
    setProgress(0);
    setProgressText('');
    parsedPartsRef.current = [];
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Spare Parts from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file with the exact column format
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format Info */}
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertTitle>Required CSV Format</AlertTitle>
            <AlertDescription className="text-xs mt-2 font-mono">
              vehicle_make, vehicle_model, year_from, year_to, part_number,
              part_category, part_description, price_gbp, price_usd,
              stock_status, compatibility_notes
            </AlertDescription>
          </Alert>

          {/* File Input */}
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                <span className="font-medium">{file.name}</span>
                <Badge variant="secondary">{totalParts.toLocaleString()} parts</Badge>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto mb-2" />
                <p>Click to select CSV file or drag and drop</p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Preview (first 5 rows)</h4>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>GBP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((part, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{part.part_number}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{part.part_description}</TableCell>
                        <TableCell>{part.vehicle_make} {part.vehicle_model}</TableCell>
                        <TableCell>${part.price_gbp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Progress Bar - shown during import */}
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

          {/* Result */}
          {result && (
            <Alert variant={result.failed === 0 ? 'default' : 'warning'}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                <p>{result.imported.toLocaleString()} new parts imported, {result.updated.toLocaleString()} updated, {result.failed.toLocaleString()} failed</p>
                {result.errors && result.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs">View errors ({result.errors.length})</summary>
                    <ul className="mt-1 text-xs list-disc list-inside max-h-24 overflow-y-auto">
                      {result.errors.slice(0, 10).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {result.errors.length > 10 && <li>...and {result.errors.length - 10} more</li>}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={!file || importing || totalParts === 0}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {importing ? `Importing...` : `Import ${totalParts.toLocaleString()} Parts`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART FORM DIALOG COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function PartFormDialog({ open, onClose, part, onSave, categories, makes }) {
  const [formData, setFormData] = useState({
    vehicle_make: '',
    vehicle_model: '',
    year_from: new Date().getFullYear(),
    year_to: new Date().getFullYear(),
    part_number: '',
    part_category: '',
    part_description: '',
    price_gbp: 0,
    price_usd: 0,
    stock_status: 'In Stock',
    compatibility_notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (part) {
      setFormData({
        vehicle_make: part.vehicleMake || '',
        vehicle_model: part.vehicleModel || '',
        year_from: part.yearFrom || new Date().getFullYear(),
        year_to: part.yearTo || new Date().getFullYear(),
        part_number: part.partNumber || '',
        part_category: part.partCategory || '',
        part_description: part.partDescription || '',
        price_gbp: part.priceGbp || 0,
        price_usd: part.priceUsd || 0,
        stock_status: part.stockStatus || 'In Stock',
        compatibility_notes: part.compatibilityNotes || ''
      });
    } else {
      setFormData({
        vehicle_make: '',
        vehicle_model: '',
        year_from: new Date().getFullYear(),
        year_to: new Date().getFullYear(),
        part_number: '',
        part_category: '',
        part_description: '',
        price_gbp: 0,
        price_usd: 0,
        stock_status: 'In Stock',
        compatibility_notes: ''
      });
    }
    setError('');
  }, [part, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (part) {
        await updateSparePart(part.id, formData);
      } else {
        await createSparePart(formData);
      }
      onSave();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {part ? 'Edit Spare Part' : 'Add New Spare Part'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Vehicle Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vehicle_make">Vehicle Make *</Label>
              <Input
                id="vehicle_make"
                value={formData.vehicle_make}
                onChange={(e) => setFormData({ ...formData, vehicle_make: e.target.value })}
                placeholder="Toyota"
                required
              />
            </div>
            <div>
              <Label htmlFor="vehicle_model">Vehicle Model *</Label>
              <Input
                id="vehicle_model"
                value={formData.vehicle_model}
                onChange={(e) => setFormData({ ...formData, vehicle_model: e.target.value })}
                placeholder="Camry"
                required
              />
            </div>
          </div>

          {/* Year Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="year_from">Year From *</Label>
              <Input
                id="year_from"
                type="number"
                value={formData.year_from}
                onChange={(e) => setFormData({ ...formData, year_from: parseInt(e.target.value) })}
                required
              />
            </div>
            <div>
              <Label htmlFor="year_to">Year To *</Label>
              <Input
                id="year_to"
                type="number"
                value={formData.year_to}
                onChange={(e) => setFormData({ ...formData, year_to: parseInt(e.target.value) })}
                required
              />
            </div>
          </div>

          {/* Part Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="part_number">Part Number *</Label>
              <Input
                id="part_number"
                value={formData.part_number}
                onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                placeholder="TOY-CAM-BRK-001"
                required
              />
            </div>
            <div>
              <Label htmlFor="part_category">Category *</Label>
              <Input
                id="part_category"
                value={formData.part_category}
                onChange={(e) => setFormData({ ...formData, part_category: e.target.value })}
                placeholder="Brakes"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="part_description">Description *</Label>
            <Textarea
              id="part_description"
              value={formData.part_description}
              onChange={(e) => setFormData({ ...formData, part_description: e.target.value })}
              placeholder="Front Brake Pad Set - Ceramic"
              required
            />
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="price_gbp">Price (GBP) *</Label>
              <Input
                id="price_gbp"
                type="number"
                step="0.01"
                value={formData.price_gbp}
                onChange={(e) => setFormData({ ...formData, price_gbp: parseFloat(e.target.value) })}
                required
              />
            </div>
            <div>
              <Label htmlFor="price_usd">Price (USD) *</Label>
              <Input
                id="price_usd"
                type="number"
                step="0.01"
                value={formData.price_usd}
                onChange={(e) => setFormData({ ...formData, price_usd: parseFloat(e.target.value) })}
                required
              />
            </div>
          </div>

          {/* Stock Status */}
          <div>
            <Label htmlFor="stock_status">Stock Status</Label>
            <Select
              value={formData.stock_status}
              onValueChange={(value) => setFormData({ ...formData, stock_status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="In Stock">In Stock</SelectItem>
                <SelectItem value="Low Stock">Low Stock</SelectItem>
                <SelectItem value="Out of Stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Compatibility Notes */}
          <div>
            <Label htmlFor="compatibility_notes">Compatibility Notes</Label>
            <Textarea
              id="compatibility_notes"
              value={formData.compatibility_notes}
              onChange={(e) => setFormData({ ...formData, compatibility_notes: e.target.value })}
              placeholder="Fits all trim levels"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {part ? 'Update' : 'Create'}
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

export default function SparePartsPage() {
  const [parts, setParts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [makes, setMakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMake, setSelectedMake] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const limit = 10; // Items per page

  // Dialog states
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [deletingPart, setDeletingPart] = useState(null);

  // Bulk operations state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({ deleted: 0, total: 0 });
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkUpdateProgress, setBulkUpdateProgress] = useState({ updated: 0, total: 0 });
  const [singleDeleting, setSingleDeleting] = useState(false);

  // Load parts
  const loadParts = useCallback(async () => {
    try {
      setLoading(true);
      const filters = {};
      if (selectedCategory) filters.category = selectedCategory;
      if (selectedMake) filters.make = selectedMake;

      const response = await getSpareParts(filters);
      setParts(response.parts || []);
      setCategories(response.categories || []);
      setMakes(response.makes || []);
    } catch (err) {
      console.error('Failed to load spare parts:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedMake]);

  useEffect(() => {
    loadParts();
  }, [loadParts]);

  // Search
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    try {
      const response = await searchSpareParts(searchQuery, 10);
      setSearchResults(response.parts || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deletingPart) return;

    setSingleDeleting(true);
    try {
      await deleteSparePart(deletingPart.id);
      setDeletingPart(null);
      loadParts();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setSingleDeleting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // BULK SELECTION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Toggle selection of a single part.
   */
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  /**
   * Toggle select all visible parts.
   */
  const toggleSelectAll = () => {
    if (selectedIds.size === displayParts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayParts.map(part => part.id)));
    }
  };

  /**
   * Clear all selections.
   */
  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  /**
   * Handle bulk delete of selected parts.
   * Processes in chunks of 100 to handle large selections.
   */
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    setBulkDeleteOpen(false);

    const ids = Array.from(selectedIds);
    const chunkSize = 100;
    let totalDeleted = 0;

    setBulkDeleteProgress({ deleted: 0, total: ids.length });

    try {
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const result = await bulkDeleteSpareParts(chunk);
        totalDeleted += result.deleted || 0;
        setBulkDeleteProgress({ deleted: totalDeleted, total: ids.length });
      }

      setSelectedIds(new Set());
      loadParts();
    } catch (err) {
      console.error('Failed to bulk delete parts:', err);
    } finally {
      setBulkDeleting(false);
      setBulkDeleteProgress({ deleted: 0, total: 0 });
    }
  };

  /**
   * Handle bulk status update of selected parts.
   * Processes in chunks of 100 to handle large selections.
   */
  const handleBulkStatusUpdate = async () => {
    if (selectedIds.size === 0 || !bulkStatusValue) return;
    setBulkUpdating(true);
    setBulkStatusOpen(false);

    const ids = Array.from(selectedIds);
    const chunkSize = 100;
    let totalUpdated = 0;

    setBulkUpdateProgress({ updated: 0, total: ids.length });

    try {
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const result = await bulkUpdateSparePartsStatus(chunk, bulkStatusValue);
        totalUpdated += result.updated || 0;
        setBulkUpdateProgress({ updated: totalUpdated, total: ids.length });
      }

      setSelectedIds(new Set());
      setBulkStatusValue('');
      loadParts();
    } catch (err) {
      console.error('Failed to bulk update status:', err);
    } finally {
      setBulkUpdating(false);
      setBulkUpdateProgress({ updated: 0, total: 0 });
    }
  };

  // Stock status badge variant
  const getStockBadgeVariant = (status) => {
    switch (status) {
      case 'In Stock': return 'default';
      case 'Low Stock': return 'warning';
      case 'Out of Stock': return 'destructive';
      default: return 'secondary';
    }
  };

  const displayParts = searchResults || parts;

  // Pagination calculations
  const totalPages = Math.ceil(displayParts.length / limit);
  const paginatedParts = displayParts.slice((page - 1) * limit, page * limit);

  // Reset to page 1 when filters or search results change
  useEffect(() => {
    setPage(1);
  }, [selectedCategory, selectedMake, searchResults]);

  // Clear search results when filters change to prevent stale search results
  // from overriding the filtered parts list
  useEffect(() => {
    setSearchResults(null);
    setSearchQuery('');
  }, [selectedCategory, selectedMake]);

  if (loading && parts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Spare Parts Catalog</h1>
          <p className="text-muted-foreground">
            Manage vehicle spare parts for the chatbot knowledge base
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button onClick={() => { setEditingPart(null); setFormDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Part
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            {/* Category Filter */}
            <div className="w-48">
              <Select
                value={selectedCategory || 'all'}
                onValueChange={(val) => setSelectedCategory(val === 'all' ? '' : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Make Filter */}
            <div className="w-48">
              <Select
                value={selectedMake || 'all'}
                onValueChange={(val) => setSelectedMake(val === 'all' ? '' : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Makes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Makes</SelectItem>
                  {makes.map(make => (
                    <SelectItem key={make} value={make}>{make}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Search parts (e.g., 'Toyota brake pads')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button variant="secondary" onClick={handleSearch} disabled={searching}>
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
              {searchResults && (
                <Button variant="ghost" onClick={() => { setSearchResults(null); setSearchQuery(''); }}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted rounded-lg border">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.size === displayParts.length && displayParts.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={clearSelection}
          >
            Clear Selection
          </Button>
          <Select
            value={bulkStatusValue}
            onValueChange={(val) => {
              setBulkStatusValue(val);
              setBulkStatusOpen(true);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Change Status..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="In Stock">In Stock</SelectItem>
              <SelectItem value="Low Stock">Low Stock</SelectItem>
              <SelectItem value="Out of Stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Selected
          </Button>
        </div>
      )}

      {/* Parts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {searchResults ? `Search Results (${displayParts.length})` : `Parts (${displayParts.length})`}
          </CardTitle>
          <CardDescription>
            {searchResults ? 'Parts matching your search query' : 'All spare parts in the catalog'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {displayParts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No spare parts found</p>
              <Button className="mt-4" onClick={() => setImportDialogOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedIds.size === displayParts.length && displayParts.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Years</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedParts.map((part) => (
                    <TableRow key={part.id} className={selectedIds.has(part.id) ? 'bg-primary/5' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(part.id)}
                          onCheckedChange={() => toggleSelect(part.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{part.partNumber}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{part.partDescription}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Car className="h-3 w-3" />
                          {part.vehicleMake} {part.vehicleModel}
                        </div>
                      </TableCell>
                      <TableCell>{part.yearFrom}-{part.yearTo}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{part.partCategory}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">£{part.priceGbp?.toFixed(2)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStockBadgeVariant(part.stockStatus)}>
                          {part.stockStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditingPart(part); setFormDialogOpen(true); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingPart(part)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, displayParts.length)} of {displayParts.length} parts
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
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <ImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImport={loadParts}
      />

      {/* Add/Edit Dialog */}
      <PartFormDialog
        open={formDialogOpen}
        onClose={() => { setFormDialogOpen(false); setEditingPart(null); }}
        part={editingPart}
        onSave={loadParts}
        categories={categories}
        makes={makes}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deletingPart} onOpenChange={() => setDeletingPart(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Spare Part</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingPart?.partDescription}"?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingPart(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Parts</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} selected part{selectedIds.size !== 1 ? 's' : ''}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleting}
            >
              Delete {selectedIds.size} Part{selectedIds.size !== 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Status Update Confirmation */}
      <AlertDialog open={bulkStatusOpen} onOpenChange={(open) => {
        setBulkStatusOpen(open);
        if (!open) setBulkStatusValue('');
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Stock Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change the stock status of {selectedIds.size} selected part{selectedIds.size !== 1 ? 's' : ''} to "{bulkStatusValue}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkStatusUpdate}
              disabled={bulkUpdating}
            >
              Update {selectedIds.size} Part{selectedIds.size !== 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Loading Overlay - Shows during any delete or update operation */}
      {(singleDeleting || bulkDeleting || bulkUpdating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 rounded-lg bg-card border shadow-lg min-w-[300px]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center w-full">
              <p className="text-lg font-medium">
                {bulkUpdating
                  ? 'Updating Stock Status'
                  : bulkDeleting
                    ? 'Deleting Parts'
                    : 'Deleting Part'
                }
              </p>
              <p className="text-sm text-muted-foreground">
                {bulkUpdating
                  ? `Updated ${bulkUpdateProgress.updated} of ${bulkUpdateProgress.total} parts...`
                  : bulkDeleting
                    ? `Deleted ${bulkDeleteProgress.deleted} of ${bulkDeleteProgress.total} parts...`
                    : `Deleting "${deletingPart?.partDescription}"...`
                }
              </p>
              {bulkDeleting && bulkDeleteProgress.total > 0 && (
                <Progress
                  value={(bulkDeleteProgress.deleted / bulkDeleteProgress.total) * 100}
                  className="mt-3"
                />
              )}
              {bulkUpdating && bulkUpdateProgress.total > 0 && (
                <Progress
                  value={(bulkUpdateProgress.updated / bulkUpdateProgress.total) * 100}
                  className="mt-3"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
