import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  AlertTriangle,
  Shield,
  BookOpen,
  LogOut,
  MessageSquare,
  ChevronLeft,
  FileCode,
  Settings,
  Sliders
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Separator } from '../../components/ui/separator';
import { clearAdminKey } from '../../services/adminService';

const navItems = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    title: 'Escalations',
    href: '/admin/escalations',
    icon: AlertTriangle,
  },
  {
    title: 'Moderation Logs',
    href: '/admin/moderation',
    icon: Shield,
  },
  {
    title: 'Knowledge Base',
    href: '/admin/knowledge-base',
    icon: BookOpen,
  },
  {
    title: 'Safety Rules',
    href: '/admin/rules',
    icon: FileCode,
  },
  {
    title: 'Moderation Settings',
    href: '/admin/moderation-settings',
    icon: Sliders,
  },
  {
    title: 'Escalation Settings',
    href: '/admin/escalation-settings',
    icon: Settings,
  },
];

export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAdminKey();
    navigate('/admin/login');
  };

  const handleBackToChat = () => {
    navigate('/');
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow border-r bg-sidebar">
          {/* Header */}
          <div className="flex h-16 items-center gap-2 border-b px-6">
            <Shield className="h-6 w-6 text-sidebar-primary" />
            <span className="font-semibold text-sidebar-foreground">SafeChat Admin</span>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 px-3 py-4">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href || 
                  (item.href !== '/admin' && location.pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t p-4">
            <div className="flex flex-col gap-2">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-sidebar-foreground"
                onClick={handleBackToChat}
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Chat
              </Button>
              <Separator />
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-sidebar-foreground hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <div className="flex flex-col flex-1">
        <header className="md:hidden flex h-14 items-center gap-4 border-b bg-sidebar px-4">
          <Shield className="h-5 w-5 text-sidebar-primary" />
          <span className="font-semibold text-sidebar-foreground">Admin</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={handleBackToChat}>
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        {/* Mobile navigation */}
        <div className="md:hidden border-b bg-sidebar px-2 py-2">
          <nav className="flex gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/admin' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                  )}
                >
                  <item.icon className="h-3 w-3" />
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="container py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
