import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  AlertTriangle, 
  Shield, 
  BookOpen,
  Clock,
  Zap,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { getStats } from '../../services/adminService';

function StatCard({ title, value, description, icon: Icon, trend }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <div className="flex items-center text-xs text-green-600 mt-1">
            <TrendingUp className="h-3 w-3 mr-1" />
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await getStats();
      setStats(response.stats);
    } catch (err) {
      setError('Failed to load statistics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  const conversations = stats?.conversations || {};
  const messages = stats?.messages || {};
  const moderation = stats?.moderation || {};
  const knowledgeBase = stats?.knowledgeBase || {};
  const dailyActivity = stats?.dailyActivity || [];

  const escalationRate = conversations.total > 0
    ? ((conversations.escalated / conversations.total) * 100).toFixed(1)
    : 0;

  const flaggedRate = messages.total > 0
    ? ((messages.flagged / messages.total) * 100).toFixed(2)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of SafeChat system metrics and safety statistics
        </p>
      </div>

      {/* Main Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Conversations"
          value={conversations.total || 0}
          description={`${conversations.last24h || 0} in last 24h`}
          icon={MessageSquare}
        />
        <StatCard
          title="Total Messages"
          value={messages.total || 0}
          description={`${messages.user || 0} user, ${messages.assistant || 0} assistant`}
          icon={MessageSquare}
        />
        <StatCard
          title="Escalations"
          value={conversations.escalated || 0}
          description={`${escalationRate}% escalation rate`}
          icon={AlertTriangle}
        />
        <StatCard
          title="Flagged Messages"
          value={messages.flagged || 0}
          description={`${flaggedRate}% of total messages`}
          icon={Shield}
        />
      </div>

      {/* Performance Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Avg Response Time"
          value={`${messages.avgResponseTimeMs || 0}ms`}
          description="Time to generate response"
          icon={Clock}
        />
        <StatCard
          title="Avg Tokens Used"
          value={messages.avgTokensUsed || 0}
          description="Tokens per response"
          icon={Zap}
        />
        <StatCard
          title="Moderation Events"
          value={moderation.totalEvents || 0}
          description={`${moderation.flaggedEvents || 0} flagged`}
          icon={Shield}
        />
        <StatCard
          title="Knowledge Base"
          value={knowledgeBase.totalDocuments || 0}
          description={`${knowledgeBase.totalCategories || 0} categories`}
          icon={BookOpen}
        />
      </div>

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity (Last 7 Days)</CardTitle>
          <CardDescription>Daily message volume and flagged content</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyActivity.length > 0 ? (
            <div className="space-y-4">
              {dailyActivity.map((day, index) => {
                const maxMessages = Math.max(...dailyActivity.map(d => d.messages));
                const percentage = maxMessages > 0 ? (day.messages / maxMessages) * 100 : 0;
                const date = new Date(day.date).toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                });
                return (
                  <div key={index} className="flex items-center gap-4">
                    <div className="w-24 text-sm text-muted-foreground">{date}</div>
                    <div className="flex-1">
                      <div className="h-4 rounded-full bg-muted overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-20 text-sm text-right">
                      <span className="font-medium">{day.messages}</span>
                      <span className="text-muted-foreground"> msgs</span>
                    </div>
                    {day.flagged > 0 && (
                      <div className="w-20 text-sm text-right text-destructive">
                        {day.flagged} flagged
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No activity data available yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Safety Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Conversations in last 7 days</span>
              <span className="font-medium">{conversations.last7d || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Escalation rate</span>
              <span className="font-medium">{escalationRate}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Content flagging rate</span>
              <span className="font-medium">{flaggedRate}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Moderation accuracy</span>
              <span className="font-medium text-green-600">Active</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">OpenAI Moderation</span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Active
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Input Sanitization</span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Active
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Escalation Detection</span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Active
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">RAG System</span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Active
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
