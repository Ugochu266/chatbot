/**
 * Moderation Settings Page
 *
 * This page allows admins to configure OpenAI Moderation API thresholds and actions
 * for each content category. The OpenAI Moderation API returns scores (0-1) for
 * various harmful content categories. This page lets admins set:
 * - Threshold: Score above which action is triggered
 * - Action: What happens when threshold is exceeded (block, escalate, flag, warn)
 * - Enabled: Whether to check this category at all
 *
 * OpenAI Moderation Categories:
 * - hate: Content expressing hatred toward groups
 * - hate/threatening: Hateful content with violent threats
 * - harassment: Content that harasses individuals
 * - harassment/threatening: Harassment with violent threats
 * - self-harm: Content about self-harm
 * - self-harm/intent: Content expressing intent to self-harm
 * - self-harm/instructions: Instructions for self-harm
 * - sexual: Sexual content
 * - sexual/minors: Sexual content involving minors
 * - violence: Violent content
 * - violence/graphic: Graphic violent content
 *
 * Features:
 * - Per-category configuration cards
 * - Threshold slider (0-100%)
 * - Action dropdown (block, escalate, flag, warn)
 * - Enable/disable toggle per category
 * - Test panel to check content against OpenAI API
 * - Visual feedback for unsaved changes
 *
 * @module admin/pages/ModerationSettingsPage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Save,
  Play,
  AlertTriangle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Slider } from '../../components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  getModerationSettings,
  updateModerationSetting,
  testModeration
} from '../../services/rulesService';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// OpenAI moderation category metadata and available actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Metadata for each OpenAI moderation category.
 * Maps category ID to human-readable label and description.
 * These categories match OpenAI's Moderation API response structure.
 */
const CATEGORY_INFO = {
  'hate': { label: 'Hate', description: 'Content that expresses hatred towards a group' },
  'hate/threatening': { label: 'Hate/Threatening', description: 'Hateful content with threats' },
  'harassment': { label: 'Harassment', description: 'Content that harasses individuals' },
  'harassment/threatening': { label: 'Harassment/Threatening', description: 'Harassment with threats' },
  'self-harm': { label: 'Self-Harm', description: 'Content about self-harm' },
  'self-harm/intent': { label: 'Self-Harm Intent', description: 'Content expressing intent to self-harm' },
  'self-harm/instructions': { label: 'Self-Harm Instructions', description: 'Instructions for self-harm' },
  'sexual': { label: 'Sexual', description: 'Sexual content' },
  'sexual/minors': { label: 'Sexual/Minors', description: 'Sexual content involving minors' },
  'violence': { label: 'Violence', description: 'Violent content' },
  'violence/graphic': { label: 'Violence/Graphic', description: 'Graphic violent content' }
};

/**
 * Available actions when content exceeds moderation threshold.
 * Each action has different severity and user experience implications.
 */
const ACTIONS = [
  { value: 'block', label: 'Block', description: 'Block the message entirely' },
  { value: 'escalate', label: 'Escalate', description: 'Flag for human review' },
  { value: 'flag', label: 'Flag', description: 'Log but allow through' },
  { value: 'warn', label: 'Warn', description: 'Show warning but allow' }
];

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY CARD COMPONENT
// Individual card for configuring one moderation category
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration card for a single moderation category.
 *
 * Displays controls for threshold, action, and enabled state.
 * Maintains local state for edits and shows "Save" button when changes exist.
 * Visual ring indicator shows when card has unsaved changes.
 *
 * @param {Object} props - Component props
 * @param {string} props.category - Category ID (e.g., 'hate', 'violence')
 * @param {Object} props.setting - Current setting values {enabled, threshold, action}
 * @param {Function} props.onUpdate - Callback to save changes (category, newSettings)
 * @param {boolean} props.saving - Whether a save operation is in progress
 * @returns {React.ReactElement} The category configuration card
 */
function CategoryCard({ category, setting, onUpdate, saving }) {
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
  // Handle field changes and save actions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update a single field in local state and mark as changed.
   * @param {string} field - Field name to update
   * @param {*} value - New value for the field
   */
  const handleChange = (field, value) => {
    setLocalSetting(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  /**
   * Save local changes to server via parent callback.
   */
  const handleSave = async () => {
    await onUpdate(category, localSetting);
    setHasChanges(false);
  };

  // Get display info for this category (label, description)
  const info = CATEGORY_INFO[category] || { label: category, description: '' };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Card className={hasChanges ? 'ring-2 ring-primary/50' : ''}>
      {/* ─────────────────────────────────────────────────────────────────────────
          CARD HEADER
          Category name, description, and enable toggle
          ───────────────────────────────────────────────────────────────────────── */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{info.label}</CardTitle>
            <CardDescription className="text-xs">{info.description}</CardDescription>
          </div>
          {/* Enable/Disable toggle for this category */}
          <Switch
            checked={localSetting.enabled}
            onCheckedChange={(checked) => handleChange('enabled', checked)}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ─────────────────────────────────────────────────────────────────────────
            THRESHOLD SLIDER
            Sets the score threshold that triggers the action (0-100%)
            ───────────────────────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Threshold</Label>
            {/* Display current threshold as percentage */}
            <span className="text-sm font-mono">{(localSetting.threshold * 100).toFixed(0)}%</span>
          </div>
          <Slider
            value={[localSetting.threshold * 100]}
            onValueChange={([value]) => handleChange('threshold', value / 100)}
            max={100}
            step={5}
            disabled={!localSetting.enabled}
          />
          <p className="text-xs text-muted-foreground">
            Scores above this threshold will trigger the action
          </p>
        </div>

        {/* ─────────────────────────────────────────────────────────────────────────
            ACTION SELECTOR
            Dropdown to choose what happens when threshold is exceeded
            ───────────────────────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-sm">Action</Label>
          <Select
            value={localSetting.action}
            onValueChange={(value) => handleChange('action', value)}
            disabled={!localSetting.enabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map(action => (
                <SelectItem key={action.value} value={action.value}>
                  <div className="flex flex-col">
                    <span>{action.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ─────────────────────────────────────────────────────────────────────────
            SAVE BUTTON
            Only shown when there are unsaved changes
            ───────────────────────────────────────────────────────────────────────── */}
        {hasChanges && (
          <Button
            size="sm"
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// Moderation settings configuration page
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main moderation settings page component.
 *
 * Displays a grid of category configuration cards and a test panel
 * for verifying moderation behavior. Settings are loaded from the
 * server and saved individually per category.
 *
 * @returns {React.ReactElement} The moderation settings page
 */
export default function ModerationSettingsPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState([]);        // Array of category settings
  const [loading, setLoading] = useState(true);        // Initial load in progress
  const [saving, setSaving] = useState(false);         // Save operation in progress
  const [testText, setTestText] = useState('');        // Text to test in test panel
  const [testResult, setTestResult] = useState(null);  // Result from test API
  const [testing, setTesting] = useState(false);       // Test operation in progress

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // Fetch settings from server on mount
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Load moderation settings from server.
   * Merges server settings with defaults for all categories.
   */
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getModerationSettings();

      // Create default settings for all known categories
      const allCategories = Object.keys(CATEGORY_INFO);
      const settingsMap = {};

      // Initialize with default values
      allCategories.forEach(cat => {
        settingsMap[cat] = {
          category: cat,
          enabled: true,
          threshold: 0.7,  // Default 70% threshold
          action: 'block'  // Default to blocking
        };
      });

      // Override defaults with actual settings from server
      (response.settings || []).forEach(s => {
        settingsMap[s.category] = s;
      });

      setSettings(Object.values(settingsMap));
    } catch (err) {
      console.error('Failed to load moderation settings:', err);
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
  // Handle category updates and moderation tests
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update a single category's settings on the server.
   * @param {string} category - Category ID to update
   * @param {Object} data - New settings for the category
   */
  const handleUpdate = async (category, data) => {
    setSaving(true);
    try {
      await updateModerationSetting(category, data);
      // Reload all settings to ensure consistency
      loadSettings();
    } catch (err) {
      console.error('Failed to update setting:', err);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Test content against OpenAI Moderation API.
   * Shows category scores and whether content would be flagged.
   */
  const handleTest = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    try {
      const response = await testModeration(testText);
      setTestResult(response.result);
    } catch (err) {
      console.error('Test failed:', err);
    } finally {
      setTesting(false);
    }
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
        <h1 className="text-3xl font-bold tracking-tight">Moderation Settings</h1>
        <p className="text-muted-foreground">
          Configure OpenAI moderation thresholds and actions per category
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TEST PANEL
          Test content against OpenAI Moderation API
          ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Test Moderation
          </CardTitle>
          <CardDescription>
            Test how content will be moderated with current settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Test input and button */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Enter text to test moderation..."
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
              Shows flagged status and per-category scores
              ───────────────────────────────────────────────────────────────────── */}
          {testResult && (
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              {/* Overall result badge and flagged categories */}
              <div className="flex items-center gap-2">
                <Badge variant={testResult.flagged ? 'destructive' : 'secondary'}>
                  {testResult.flagged ? 'Flagged' : 'Passed'}
                </Badge>
                {testResult.categories?.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    Categories: {testResult.categories.join(', ')}
                  </span>
                )}
              </div>

              {/* Per-category score breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(testResult.scores || {}).map(([category, score]) => (
                  <div
                    key={category}
                    className={`flex justify-between text-xs p-2 rounded ${
                      score > 0.5 ? 'bg-destructive/10' : 'bg-muted'
                    }`}
                  >
                    <span className="text-muted-foreground">{category}</span>
                    <span className={`font-mono ${score > 0.5 ? 'text-destructive' : ''}`}>
                      {(score * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════
          CATEGORY SETTINGS GRID
          One card per moderation category
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Category Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {settings.map(setting => (
            <CategoryCard
              key={setting.category}
              category={setting.category}
              setting={setting}
              onUpdate={handleUpdate}
              saving={saving}
            />
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          INFO CARD
          Explanation of how moderation works
          ═══════════════════════════════════════════════════════════════════════ */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">About Moderation</p>
              <p className="text-muted-foreground mt-1">
                Content moderation uses OpenAI's Moderation API. Each category returns a score from 0-1.
                When a score exceeds the threshold you set, the configured action is triggered.
                Changes take effect within 5 minutes due to caching.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
