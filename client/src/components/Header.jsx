import React from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Plus, Settings } from 'lucide-react';

function Header({ onNewChat }) {
  return (
    <header className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        <h1 className="font-semibold text-lg">SafeChat</h1>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onNewChat}
          className="p-2 hover:bg-white/10 rounded-md transition-colors"
          title="New Chat"
        >
          <Plus className="h-5 w-5" />
        </button>
        <Link
          to="/admin/login"
          className="p-2 hover:bg-white/10 rounded-md transition-colors"
          title="Admin Dashboard"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}

export default Header;
