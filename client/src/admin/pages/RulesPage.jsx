/**
 * Safety Rules Management Page
 *
 * This page provides comprehensive management of safety rules including regex patterns,
 * blocked keywords, escalation triggers, and allowed topics. Rules are evaluated against
 * user input to ensure safe and appropriate chatbot interactions.
 *
 * Rule Types:
 * - regex_pattern: Custom regex patterns for detecting specific content
 * - blocked_keyword: Simple keyword matching (case-insensitive)
 * - escalation_keyword: Keywords that trigger human escalation
 * - allowed_topic: Topics the chatbot is permitted to discuss
 *
 * Rule Actions:
 * - block: Completely block the message
 * - escalate: Flag for human review
 * - flag: Log but allow through
 * - warn: Show warning but allow
 *
 * Categories:
 * - Injection: prompt injection, jailbreak attempts
 * - Content: profanity, slurs, inappropriate, threats
 * - Spam: promotional content, PII
 * - Escalation: crisis, legal, complaint, sentiment
 *
 * Features:
 * - CRUD operations for all rule types
 * - Rule testing interface (test single rule or all rules)
 * - Search and filter by type
 * - Priority-based rule ordering
 * - Enable/disable individual rules
 * - Export rules as JSON
 *
 * @module admin/pages/RulesPage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Filter,
  Download,
  Play,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
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
  getRules,
  createRule,
  updateRule,
  deleteRule,
  testRule,
  exportRules,
  testAllRules
} from '../../services/rulesService';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// Configuration options for rule forms
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Available rule types for the safety rule engine.
 */
const RULE_TYPES = [
  { value: 'regex_pattern', label: 'Regex Pattern' },
  { value: 'blocked_keyword', label: 'Blocked Keyword' },
  { value: 'escalation_keyword', label: 'Escalation Keyword' },
  { value: 'allowed_topic', label: 'Allowed Topic' }
];

/**
 * Actions that can be taken when a rule matches.
 */
const ACTIONS = [
  { value: 'block', label: 'Block' },
  { value: 'escalate', label: 'Escalate' },
  { value: 'flag', label: 'Flag' },
  { value: 'warn', label: 'Warn' }
];

/**
 * Categories for organizing rules by purpose.
 */
const CATEGORIES = [
  'injection', 'bypass', 'extraction',
  'profanity', 'slur', 'inappropriate', 'threat',
  'spam', 'promotional', 'pii',
  'off-topic', 'crisis', 'legal', 'complaint', 'sentiment',
  'custom'
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Modal dialog for creating or editing safety rules.
 *
 * Includes a built-in test panel to verify rule patterns before saving.
 *
 * @param {Object} props - Component props
 * @param {Object|null} props.rule - Existing rule to edit, or null for create
 * @param {boolean} props.open - Whether dialog is open
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.onSave - Save handler (receives form data)
 * @param {Object} props.meta - Metadata from rules API
 * @returns {React.ReactElement} Rule form dialog
 */
function RuleDialog({ rule, open, onClose, onSave, meta }) {
  // ─────────────────────────────────────────────────────────────────────────────
  // LOCAL STATE
  // Form fields and test panel state
  // ─────────────────────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    ruleType: 'regex_pattern',
    category: '',
    value: '',
    action: 'block',
    priority: 0,
    enabled: true,
    description: ''
  });
  const [saving, setSaving] = useState(false);
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────────
  // FORM INITIALIZATION
  // Populate form when rule changes or dialog opens
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (rule) {
      // Editing existing rule - populate form
      setFormData({
        ruleType: rule.ruleType || 'regex_pattern',
        category: rule.category || '',
        value: rule.value || '',
        action: rule.action || 'block',
        priority: rule.priority || 0,
        enabled: rule.enabled !== false,
        description: rule.description || ''
      });
    } else {
      // Creating new rule - reset form to defaults
      setFormData({
        ruleType: 'regex_pattern',
        category: '',
        value: '',
        action: 'block',
        priority: 0,
        enabled: true,
        description: ''
      });
    }
    // Reset test state
    setTestResult(null);
    setTestText('');
  }, [rule, open]);

  /**
   * Handles form submission.
   * Validates and saves the rule.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      console.error('Failed to save rule:', err);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Tests the current rule pattern against test text.
   * Calls the API to evaluate the pattern.
   */
  const handleTest = async () => {
    if (!testText || !formData.value) return;
    setTesting(true);
    try {
      const result = await testRule(formData.ruleType, formData.value, testText);
      setTestResult(result.result);
    } catch (err) {
      console.error('Test failed:', err);
    } finally {
      setTesting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          {/* ─────────────────────────────────────────────────────────────────
              DIALOG HEADER
              ───────────────────────────────────────────────────────────────── */}
          <DialogHeader>
            <DialogTitle>{rule ? 'Edit Rule' : 'Add Rule'}</DialogTitle>
            <DialogDescription>
              {rule ? 'Update the safety rule' : 'Create a new safety rule'}
            </DialogDescription>
          </DialogHeader>

          {/* ─────────────────────────────────────────────────────────────────
              FORM FIELDS
              ───────────────────────────────────────────────────────────────── */}
          <div className="space-y-4 py-4">
            {/* Rule type and category row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Rule type selector */}
              <div className="space-y-2">
                <Label>Rule Type</Label>
                <Select
                  value={formData.ruleType}
                  onValueChange={(val) => setFormData(d => ({ ...d, ruleType: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category selector */}
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData(d => ({ ...d, category: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rule value/pattern */}
            <div className="space-y-2">
              <Label htmlFor="value">
                {formData.ruleType === 'regex_pattern' ? 'Regex Pattern' : 'Keyword/Value'}
              </Label>
              <Textarea
                id="value"
                value={formData.value}
                onChange={(e) => setFormData(d => ({ ...d, value: e.target.value }))}
                placeholder={formData.ruleType === 'regex_pattern'
                  ? 'e.g., ignore\\s+previous\\s+instructions'
                  : 'e.g., jailbreak'}
                className="font-mono text-sm"
                required
              />
              {formData.ruleType === 'regex_pattern' && (
                <p className="text-xs text-muted-foreground">
                  Use JavaScript regex syntax. Patterns are case-insensitive.
                </p>
              )}
            </div>

            {/* Action and priority row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Action selector */}
              <div className="space-y-2">
                <Label>Action</Label>
                <Select
                  value={formData.action}
                  onValueChange={(val) => setFormData(d => ({ ...d, action: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map(action => (
                      <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority input */}
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData(d => ({ ...d, priority: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(d => ({ ...d, description: e.target.value }))}
                placeholder="Optional description of what this rule does"
              />
            </div>

            {/* Enabled toggle */}
            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData(d => ({ ...d, enabled: checked }))}
              />
              <Label htmlFor="enabled">Enabled</Label>
            </div>

            {/* ─────────────────────────────────────────────────────────────────
                TEST PANEL
                Test the rule pattern before saving
                ───────────────────────────────────────────────────────────────── */}
            <Card className="bg-muted/50">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Test Rule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter test text..."
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTest}
                    disabled={testing || !testText || !formData.value}
                  >
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                </div>
                {/* Test result display */}
                {testResult && (
                  <div className={`p-2 rounded text-sm ${testResult.matched ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600'}`}>
                    {testResult.matched ? (
                      <>Matched: "{testResult.matchDetails?.matched}" at position {testResult.matchDetails?.index}</>
                    ) : (
                      'No match'
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              DIALOG FOOTER
              ───────────────────────────────────────────────────────────────── */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save'}
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
 * Main safety rules management page component.
 *
 * Provides comprehensive interface for managing all safety rules including
 * CRUD operations, testing, filtering, and export functionality.
 *
 * @returns {React.ReactElement} Rules page UI
 */
export default function RulesPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [rules, setRules] = useState([]);              // All rules
  const [meta, setMeta] = useState({});                // API metadata
  const [loading, setLoading] = useState(true);        // Initial loading state
  const [searchQuery, setSearchQuery] = useState('');  // Search filter
  const [filterType, setFilterType] = useState('all'); // Rule type filter
  const [editingRule, setEditingRule] = useState(null);  // Rule being edited
  const [dialogOpen, setDialogOpen] = useState(false);   // Create/edit dialog state
  const [deleteRuleItem, setDeleteRuleItem] = useState(null);  // Rule pending deletion
  const [deleting, setDeleting] = useState(false);     // Delete in progress
  const [page, setPage] = useState(1);                 // Current page number
  const limit = 10;  // Items per page

  // Test panel state
  const [testText, setTestText] = useState('');        // Test input text
  const [testResult, setTestResult] = useState(null);  // Test result from API
  const [testing, setTesting] = useState(false);       // Test in progress

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Loads rules from API with optional type filter.
   * Memoized with useCallback to prevent unnecessary re-fetches.
   */
  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      const filters = {};
      if (filterType !== 'all') filters.ruleType = filterType;
      const response = await getRules(filters);
      setRules(response.rules || []);
      setMeta(response.meta || {});
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  // Reload rules when filter changes
  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // ─────────────────────────────────────────────────────────────────────────────
  // CRUD HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Saves a rule (create or update).
   * Called by RuleDialog on form submission.
   */
  const handleSave = async (data) => {
    if (editingRule) {
      await updateRule(editingRule.id, data);
    } else {
      await createRule(data);
    }
    loadRules();
  };

  /**
   * Deletes the rule pending in deleteRuleItem state.
   * Called when user confirms deletion dialog.
   */
  const handleDelete = async () => {
    if (!deleteRuleItem) return;
    setDeleting(true);
    try {
      await deleteRule(deleteRuleItem.id);
      setDeleteRuleItem(null);
      loadRules();
    } catch (err) {
      console.error('Failed to delete rule:', err);
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Exports all rules as a JSON file download.
   */
  const handleExport = async () => {
    try {
      const data = await exportRules();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `safety-rules-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  /**
   * Tests input text against all rules.
   * Shows comprehensive results including all matched rules.
   */
  const handleTestAll = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    try {
      const response = await testAllRules(testText);
      setTestResult(response.result);
    } catch (err) {
      console.error('Test failed:', err);
    } finally {
      setTesting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CLIENT-SIDE FILTERING
  // Filter rules by search query
  // ─────────────────────────────────────────────────────────────────────────────
  const filteredRules = rules.filter(rule =>
    searchQuery === '' ||
    rule.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (rule.description && rule.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(filteredRules.length / limit);
  const paginatedRules = filteredRules.slice((page - 1) * limit, page * limit);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterType]);

  /**
   * Returns badge variant based on rule action severity.
   */
  const getActionBadgeVariant = (action) => {
    switch (action) {
      case 'block': return 'destructive';
      case 'escalate': return 'warning';
      case 'flag': return 'secondary';
      default: return 'outline';
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading && rules.length === 0) {
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
          Title and action buttons
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Safety Rules</h1>
          <p className="text-muted-foreground">
            Manage regex patterns, blocked keywords, and safety rules
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => { setEditingRule(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TEST ALL RULES PANEL
          Test input against all safety rules at once
          ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Test Input Against All Rules
          </CardTitle>
          <CardDescription>
            Test how user input will be evaluated against all {rules.length} safety rules
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Test input */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Enter text to test against safety rules (e.g., profanity, spam, prompt injection attempts)..."
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              className="flex-1"
              rows={2}
            />
            <Button onClick={handleTestAll} disabled={testing || !testText.trim()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
            </Button>
          </div>

          {/* Test results display */}
          {testResult && (
            <div className={`p-4 rounded-lg space-y-3 ${
              testResult.wouldBlock ? 'bg-destructive/10' :
              testResult.wouldEscalate ? 'bg-orange-500/10' :
              testResult.wouldWarn ? 'bg-yellow-500/10' :
              testResult.wouldFlag ? 'bg-blue-500/10' :
              'bg-green-500/10'
            }`}>
              {/* Overall result summary */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={
                  testResult.wouldBlock ? 'destructive' :
                  testResult.wouldEscalate ? 'warning' :
                  testResult.matchCount > 0 ? 'secondary' : 'default'
                }>
                  {testResult.overallAction === 'allow' ? 'Passed' : testResult.overallAction.toUpperCase()}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {testResult.matchCount} of {testResult.totalRulesChecked} rules matched
                </span>
                {testResult.categoriesMatched?.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    | Categories: {testResult.categoriesMatched.join(', ')}
                  </span>
                )}
              </div>

              {/* Matched rules list */}
              {testResult.matches?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Matched Rules:</p>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {testResult.matches.map((match, i) => (
                      <div
                        key={i}
                        className={`flex items-start justify-between text-sm p-2 rounded ${
                          match.action === 'block' ? 'bg-destructive/20' :
                          match.action === 'escalate' ? 'bg-orange-500/20' :
                          match.action === 'warn' ? 'bg-yellow-500/20' :
                          'bg-blue-500/20'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">{match.ruleType}</Badge>
                            {match.category && <Badge variant="secondary" className="text-xs">{match.category}</Badge>}
                            <Badge variant={
                              match.action === 'block' ? 'destructive' :
                              match.action === 'escalate' ? 'warning' : 'secondary'
                            } className="text-xs">
                              {match.action}
                            </Badge>
                          </div>
                          <p className="font-mono text-xs mt-1 text-muted-foreground truncate">
                            {match.value}
                          </p>
                          {match.description && (
                            <p className="text-xs text-muted-foreground mt-1">{match.description}</p>
                          )}
                        </div>
                        {match.matchDetails && (
                          <span className="text-xs font-mono bg-background px-2 py-1 rounded ml-2">
                            "{match.matchDetails.matched}"
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No matches message */}
              {testResult.matchCount === 0 && (
                <p className="text-sm text-green-600">
                  No safety rules were triggered. This input would be allowed through.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          SEARCH AND FILTER BAR
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {RULE_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          RULES TABLE
          ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Rules ({filteredRules.length})
          </CardTitle>
          <CardDescription>
            Safety rules are evaluated in order of priority (highest first)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredRules.length === 0 ? (
            /* Empty state */
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No rules found</p>
            </div>
          ) : (
            <>
              {/* Rules data table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <Badge variant="outline">{rule.ruleType}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs">
                        {rule.value}
                      </TableCell>
                      <TableCell>
                        {rule.category && <Badge variant="secondary">{rule.category}</Badge>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(rule.action)}>{rule.action}</Badge>
                      </TableCell>
                      <TableCell>{rule.priority}</TableCell>
                      <TableCell>
                        <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditingRule(rule); setDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteRuleItem(rule)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, filteredRules.length)} of {filteredRules.length} rules
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
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          CREATE/EDIT RULE DIALOG
          ═══════════════════════════════════════════════════════════════════════ */}
      <RuleDialog
        rule={editingRule}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingRule(null); }}
        onSave={handleSave}
        meta={meta}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          DELETE CONFIRMATION DIALOG
          ═══════════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteRuleItem} onOpenChange={() => setDeleteRuleItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
