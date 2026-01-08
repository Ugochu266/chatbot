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

const ACTIONS = [
  { value: 'block', label: 'Block', description: 'Block the message entirely' },
  { value: 'escalate', label: 'Escalate', description: 'Flag for human review' },
  { value: 'flag', label: 'Flag', description: 'Log but allow through' },
  { value: 'warn', label: 'Warn', description: 'Show warning but allow' }
];

function CategoryCard({ category, setting, onUpdate, saving }) {
  const [localSetting, setLocalSetting] = useState(setting);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalSetting(setting);
    setHasChanges(false);
  }, [setting]);

  const handleChange = (field, value) => {
    setLocalSetting(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await onUpdate(category, localSetting);
    setHasChanges(false);
  };

  const info = CATEGORY_INFO[category] || { label: category, description: '' };

  return (
    <Card className={hasChanges ? 'ring-2 ring-primary/50' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{info.label}</CardTitle>
            <CardDescription className="text-xs">{info.description}</CardDescription>
          </div>
          <Switch
            checked={localSetting.enabled}
            onCheckedChange={(checked) => handleChange('enabled', checked)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Threshold</Label>
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

export default function ModerationSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getModerationSettings();

      // Create settings for all categories
      const allCategories = Object.keys(CATEGORY_INFO);
      const settingsMap = {};

      // Default settings for each category
      allCategories.forEach(cat => {
        settingsMap[cat] = {
          category: cat,
          enabled: true,
          threshold: 0.7,
          action: 'block'
        };
      });

      // Override with actual settings
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

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleUpdate = async (category, data) => {
    setSaving(true);
    try {
      await updateModerationSetting(category, data);
      loadSettings();
    } catch (err) {
      console.error('Failed to update setting:', err);
    } finally {
      setSaving(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Moderation Settings</h1>
        <p className="text-muted-foreground">
          Configure OpenAI moderation thresholds and actions per category
        </p>
      </div>

      {/* Test Panel */}
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

          {testResult && (
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
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

      {/* Category Settings */}
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

      {/* Info Card */}
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
