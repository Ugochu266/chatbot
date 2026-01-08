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

function KeywordInput({ keywords, onChange }) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      onChange([...keywords, trimmed]);
      setInputValue('');
    }
  };

  const handleRemove = (keyword) => {
    onChange(keywords.filter(k => k !== keyword));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
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
      <div className="flex flex-wrap gap-1.5 min-h-[60px] p-2 rounded-md border bg-muted/50">
        {keywords.length === 0 ? (
          <span className="text-xs text-muted-foreground">No keywords added</span>
        ) : (
          keywords.map((keyword, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {keyword}
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

function CategoryTab({ category, setting, onUpdate, saving }) {
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

  const info = CATEGORY_INFO[category] || { label: category, description: '', urgency: 'normal', color: '' };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className={info.color}>{info.label}</span>
                <Badge variant="outline">{info.urgency}</Badge>
              </CardTitle>
              <CardDescription>{info.description}</CardDescription>
            </div>
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

export default function EscalationSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('crisis');
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getEscalationSettings();

      // Create settings for all categories
      const allCategories = Object.keys(CATEGORY_INFO);
      const settingsMap = {};

      // Default settings for each category
      allCategories.forEach(cat => {
        const info = CATEGORY_INFO[cat];
        settingsMap[cat] = {
          category: cat,
          enabled: true,
          keywords: [],
          responseTemplate: '',
          priority: info.urgency === 'critical' ? 100 : info.urgency === 'high' ? 80 : info.urgency === 'medium' ? 60 : 40
        };
      });

      // Override with actual settings
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

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleUpdate = async (category, data) => {
    setSaving(true);
    try {
      await updateEscalationSetting(category, data);
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
      const response = await testEscalation(testText);
      setTestResult(response.result);
    } catch (err) {
      console.error('Test failed:', err);
    } finally {
      setTesting(false);
    }
  };

  const getSettingByCategory = (category) => {
    return settings.find(s => s.category === category) || {
      category,
      enabled: true,
      keywords: [],
      responseTemplate: '',
      priority: 0
    };
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
        <h1 className="text-3xl font-bold tracking-tight">Escalation Settings</h1>
        <p className="text-muted-foreground">
          Configure keywords and responses for human escalation triggers
        </p>
      </div>

      {/* Test Panel */}
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

          {testResult && (
            <div className={`p-4 rounded-lg space-y-2 ${
              testResult.shouldEscalate ? 'bg-destructive/10' : 'bg-muted/50'
            }`}>
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
              {testResult.reason && (
                <p className="text-sm text-muted-foreground">
                  Reason: {testResult.reason}
                </p>
              )}
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

      {/* Category Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          {Object.entries(CATEGORY_INFO).map(([cat, info]) => (
            <TabsTrigger key={cat} value={cat} className="gap-1">
              <span className={info.color}>
                {info.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

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

      {/* Info Card */}
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
