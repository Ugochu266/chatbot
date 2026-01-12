/**
 * Author: Edoziem Ugochukwu Destiny
 * Student ID: 23057995
 */

/**
 * Escalation Settings Page
 *
 * This page allows admins to configure keyword-based escalation triggers that
 * cause conversations to be flagged for human agent review. Escalation is
 * separate from content moderation - it's about detecting when a customer
 * needs human assistance regardless of content safety.
 *
 * Escalation Categories:
 * - Crisis: Mental health emergencies, self-harm indicators (CRITICAL priority)
 * - Legal: Legal threats, lawyer mentions, lawsuit references (HIGH priority)
 * - Complaint: Customer complaints, manager requests, escalation demands (MEDIUM priority)
 * - Sentiment: Highly negative emotional content, frustration (MEDIUM priority)
 *
 * Configuration per category:
 * - Keywords: Words/phrases that trigger escalation
 * - Response Template: Custom message shown when escalation triggers
 * - Priority: Ordering when multiple triggers match
 * - Enabled: Whether this category is active
 *
 * Features:
 * - Tabbed interface for each category
 * - Dynamic keyword management (add/remove)
 * - Custom response templates
 * - Priority ordering
 * - Test panel to check detection
 * - Visual feedback for unsaved changes
 *
 * @module admin/pages/EscalationSettingsPage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Save,
  Play,
  Plus,
  X,
  MessageSquare
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  getEscalationSettings,
  updateEscalationSetting,
  testEscalation
} from '../../services/rulesService';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// Escalation category metadata
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Metadata for each escalation category.
 * Includes display info and urgency level for prioritization.
 *
 * Urgency levels:
 * - critical: Immediate human intervention needed (e.g., crisis)
 * - high: Important but not life-threatening (e.g., legal)
 * - medium: Standard escalation (e.g., complaints)
 */
const CATEGORY_INFO = {
  'crisis': {
    label: 'Crisis',
    description: 'Mental health crisis or self-harm indicators',
    urgency: 'critical',
    color: 'text-red-500'
  },
  'legal': {
    label: 'Legal',
    description: 'Legal threats or lawyer mentions',
    urgency: 'high',
    color: 'text-orange-500'
  },
  'complaint': {
    label: 'Complaint',
    description: 'Customer complaints or escalation requests',
    urgency: 'medium',
    color: 'text-yellow-500'
  },
  'sentiment': {
    label: 'Negative Sentiment',
    description: 'Highly negative emotional content',
    urgency: 'medium',
    color: 'text-blue-500'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORD INPUT COMPONENT
// Reusable component for managing keyword lists
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Keyword management input component.
 *
 * Provides an input field for adding keywords and displays existing
 * keywords as removable badges. Supports Enter key for quick addition.
 *
 * @param {Object} props - Component props
 * @param {string[]} props.keywords - Current list of keywords
 * @param {Function} props.onChange - Callback when keywords change
 * @returns {React.ReactElement} The keyword input component
 */
function KeywordInput({ keywords, onChange }) {
  // Local state for the input field
  const [inputValue, setInputValue] = useState('');

  /**
   * Add the current input value as a new keyword.
   * Prevents duplicates and empty values.
   */
  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      onChange([...keywords, trimmed]);
      setInputValue('');
    }
  };

  /**
   * Remove a keyword from the list.
   * @param {string} keyword - Keyword to remove
   */
  const handleRemove = (keyword) => {
    onChange(keywords.filter(k => k !== keyword));
  };

  /**
   * Handle Enter key press to add keyword.
   * @param {React.KeyboardEvent} e - Keyboard event
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      {/* Input field with add button */}
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add keyword..."
          className="flex-1"
        />
        <Button type="button" size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Keyword badges display */}
      <div className="flex flex-wrap gap-1.5 min-h-[60px] p-2 rounded-md border bg-muted/50">
        {keywords.length === 0 ? (
          <span className="text-xs text-muted-foreground">No keywords added</span>
        ) : (
          keywords.map((keyword, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {keyword}
              {/* Remove button for each keyword */}
              <button
                type="button"
                onClick={() => handleRemove(keyword)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY TAB COMPONENT
// Configuration form for a single escalation category
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration tab content for a single escalation category.
 *
 * Displays a card with all configuration options for one category:
 * keywords, response template, priority, and enabled state.
 * Maintains local state for edits until explicitly saved.
 *
 * @param {Object} props - Component props
 * @param {string} props.category - Category ID (e.g., 'crisis', 'legal')
 * @param {Object} props.setting - Current setting values
 * @param {Function} props.onUpdate - Callback to save changes
 * @param {boolean} props.saving - Whether save is in progress
 * @returns {React.ReactElement} The category configuration tab content
 */
function CategoryTab({ category, setting, onUpdate, saving }) {
  // ─────────────────────────────────────────────────────────────────────────────
  // LOCAL STATE
  // Track edited values separate from props until saved
  // ─────────────────────────────────────────────────────────────────────────────
  const [localSetting, setLocalSetting] = useState(setting);
  const [hasChanges, setHasChanges] = useState(false);

  // Reset local state when props change (after save or external update)
  useEffect(() => {
    setLocalSetting(setting);
    setHasChanges(false);
  }, [setting]);

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update a single field in local state.
   * @param {string} field - Field name to update
   * @param {*} value - New value for the field
   */
  const handleChange = (field, value) => {
    setLocalSetting(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  /**
   * Save local changes to server.
   */
  const handleSave = async () => {
    await onUpdate(category, localSetting);
    setHasChanges(false);
  };

  // Get display info for this category
  const info = CATEGORY_INFO[category] || { label: category, description: '', urgency: 'normal', color: '' };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Card>
        {/* ─────────────────────────────────────────────────────────────────────────
            CARD HEADER
            Category name, urgency badge, and enable toggle
            ───────────────────────────────────────────────────────────────────────── */}
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {/* Category name with color coding */}
                <span className={info.color}>{info.label}</span>
                {/* Urgency level badge */}
                <Badge variant="outline">{info.urgency}</Badge>
              </CardTitle>
              <CardDescription>{info.description}</CardDescription>
            </div>
            {/* Enable/Disable toggle */}
            <div className="flex items-center gap-2">
              <Label htmlFor={`enabled-${category}`} className="text-sm">Enabled</Label>
              <Switch
                id={`enabled-${category}`}
                checked={localSetting.enabled}
                onCheckedChange={(checked) => handleChange('enabled', checked)}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* ─────────────────────────────────────────────────────────────────────────
              KEYWORDS SECTION
              Add/remove trigger keywords for this category
              ───────────────────────────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>Keywords</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Messages containing these keywords will trigger escalation
            </p>
            <KeywordInput
              keywords={localSetting.keywords || []}
              onChange={(keywords) => handleChange('keywords', keywords)}
            />
          </div>

          {/* ─────────────────────────────────────────────────────────────────────────
              RESPONSE TEMPLATE
              Custom message shown to user when escalation triggers
              ───────────────────────────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="responseTemplate">Response Template</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Custom message shown to user when escalation is triggered
            </p>
            <Textarea
              id="responseTemplate"
              value={localSetting.responseTemplate || ''}
              onChange={(e) => handleChange('responseTemplate', e.target.value)}
              placeholder="Enter the response message to show when this escalation type is triggered..."
              rows={4}
            />
          </div>

          {/* ─────────────────────────────────────────────────────────────────────────
              PRIORITY SETTING
              Determines order when multiple escalations match
              ───────────────────────────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              type="number"
              value={localSetting.priority || 0}
              onChange={(e) => handleChange('priority', parseInt(e.target.value) || 0)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Higher priority escalations are processed first
            </p>
          </div>

          {/* ─────────────────────────────────────────────────────────────────────────
              SAVE BUTTON
              Only shown when there are unsaved changes
              ───────────────────────────────────────────────────────────────────────── */}
          {hasChanges && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// Escalation settings configuration page
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main escalation settings page component.
 *
 * Displays tabbed interface for configuring each escalation category
 * and a test panel for verifying detection behavior.
 *
 * @returns {React.ReactElement} The escalation settings page
 */
export default function EscalationSettingsPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState([]);         // Array of category settings
  const [loading, setLoading] = useState(true);         // Initial load in progress
  const [saving, setSaving] = useState(false);          // Save operation in progress
  const [activeTab, setActiveTab] = useState('crisis'); // Currently selected tab
  const [testText, setTestText] = useState('');         // Text to test in test panel
  const [testResult, setTestResult] = useState(null);   // Result from test API
  const [testing, setTesting] = useState(false);        // Test operation in progress

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // Fetch settings from server on mount
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Load escalation settings from server.
   * Merges server settings with defaults for all categories.
   */
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getEscalationSettings();

      // Create default settings for all known categories
      const allCategories = Object.keys(CATEGORY_INFO);
      const settingsMap = {};

      // Initialize with default values based on urgency
      allCategories.forEach(cat => {
        const info = CATEGORY_INFO[cat];
        settingsMap[cat] = {
          category: cat,
          enabled: true,
          keywords: [],
          responseTemplate: '',
          // Set priority based on urgency level
          priority: info.urgency === 'critical' ? 100 : info.urgency === 'high' ? 80 : info.urgency === 'medium' ? 60 : 40
        };
      });

      // Override defaults with actual settings from server
      (response.settings || []).forEach(s => {
        settingsMap[s.category] = s;
      });

      setSettings(Object.values(settingsMap));
    } catch (err) {
      console.error('Failed to load escalation settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update a single category's settings on the server.
   * @param {string} category - Category ID to update
   * @param {Object} data - New settings for the category
   */
  const handleUpdate = async (category, data) => {
    setSaving(true);
    try {
      await updateEscalationSetting(category, data);
      // Reload all settings to ensure consistency
      loadSettings();
    } catch (err) {
      console.error('Failed to update setting:', err);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Test content against escalation detection.
   * Shows whether content would trigger escalation and why.
   */
  const handleTest = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    try {
      const response = await testEscalation(testText);
      setTestResult(response.result);
    } catch (err) {
      console.error('Test failed:', err);
    } finally {
      setTesting(false);
    }
  };

  /**
   * Get settings for a specific category.
   * Returns defaults if category not found in settings.
   * @param {string} category - Category ID
   * @returns {Object} Settings for the category
   */
  const getSettingByCategory = (category) => {
    return settings.find(s => s.category === category) || {
      category,
      enabled: true,
      keywords: [],
      responseTemplate: '',
      priority: 0
    };
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // Show spinner while fetching initial data
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
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
          Title and description
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Escalation Settings</h1>
        <p className="text-muted-foreground">
          Configure keywords and responses for human escalation triggers
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TEST PANEL
          Test content against escalation detection
          ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Test Escalation Detection
          </CardTitle>
          <CardDescription>
            Test how messages will be analyzed for escalation triggers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Test input and button */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Enter text to test escalation detection..."
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              className="flex-1"
              rows={2}
            />
            <Button onClick={handleTest} disabled={testing || !testText.trim()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
            </Button>
          </div>

          {/* ─────────────────────────────────────────────────────────────────────
              TEST RESULTS
              Shows escalation status, type, urgency, and matched triggers
              ───────────────────────────────────────────────────────────────────── */}
          {testResult && (
            <div className={`p-4 rounded-lg space-y-2 ${
              testResult.shouldEscalate ? 'bg-destructive/10' : 'bg-muted/50'
            }`}>
              {/* Result badges - escalation status, type, and urgency */}
              <div className="flex items-center gap-2">
                <Badge variant={testResult.shouldEscalate ? 'destructive' : 'secondary'}>
                  {testResult.shouldEscalate ? 'Would Escalate' : 'No Escalation'}
                </Badge>
                {testResult.type && (
                  <Badge variant="outline">{testResult.type}</Badge>
                )}
                {testResult.urgency && testResult.urgency !== 'normal' && (
                  <Badge variant={
                    testResult.urgency === 'critical' ? 'destructive' :
                    testResult.urgency === 'high' ? 'warning' : 'secondary'
                  }>
                    {testResult.urgency}
                  </Badge>
                )}
              </div>

              {/* Escalation reason */}
              {testResult.reason && (
                <p className="text-sm text-muted-foreground">
                  Reason: {testResult.reason}
                </p>
              )}

              {/* Matched trigger keywords */}
              {testResult.triggers?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {testResult.triggers.map((trigger, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{trigger}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          CATEGORY TABS
          One tab per escalation category with full configuration
          ═══════════════════════════════════════════════════════════════════════ */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Tab buttons */}
        <TabsList className="grid w-full grid-cols-4">
          {Object.entries(CATEGORY_INFO).map(([cat, info]) => (
            <TabsTrigger key={cat} value={cat} className="gap-1">
              <span className={info.color}>
                {info.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab content - one CategoryTab per category */}
        {Object.keys(CATEGORY_INFO).map(category => (
          <TabsContent key={category} value={category}>
            <CategoryTab
              category={category}
              setting={getSettingByCategory(category)}
              onUpdate={handleUpdate}
              saving={saving}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════════════════
          INFO CARD
          Explanation of how escalation works
          ═══════════════════════════════════════════════════════════════════════ */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <MessageSquare className="h-5 w-5 text-blue-500 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">About Escalation</p>
              <p className="text-muted-foreground mt-1">
                Escalation detection scans messages for keywords that indicate the conversation
                should be handed off to a human agent. Crisis keywords have the highest priority
                and trigger immediate escalation. Changes take effect within 5 minutes due to caching.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
