import React, { useState, useEffect } from 'react';
import { Plus, Clock, Send, Search, X } from 'lucide-react';
import { Navbar } from '../../components/layout/Navbar';
import { ScheduledMailsView } from '../scheduled-emails/ScheduledMailsView';
import { SentEmailsTable } from '../sent-emails/SentEmailsTable';
import { SearchResults } from '../search/SearchResults';
import { ComposeModal } from '../compose/ComposeModal';
import { SenderModal } from '../senders/SenderModal';
import { SlackConnectModal } from '../slack/SlackConnectModal';

export const DashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSenderOpen, setIsSenderOpen] = useState(false);
  const [isSlackOpen, setIsSlackOpen] = useState(false);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar
        onOpenSlackModal={() => setIsSlackOpen(true)}
        onOpenSenderModal={() => setIsSenderOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Control Bar: Title, Search, Primary Action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
              Email Scheduler Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live BullMQ queue tracking & Ethereal SMTP dispatching
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-72">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Search ES (recipient, subject)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Compose New Email Primary Action */}
            <button
              onClick={() => setIsComposeOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all shadow-md shadow-primary/25 shrink-0"
            >
              <Plus size={16} />
              <span>Compose New Email</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        {debouncedQuery ? (
          <div className="space-y-4">
            <SearchResults query={debouncedQuery} />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="border-b border-border flex items-center gap-2">
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === 'scheduled'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Clock size={15} />
                <span>Scheduled Mails</span>
              </button>

              <button
                onClick={() => setActiveTab('sent')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === 'sent'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Send size={15} />
                <span>Sent Emails</span>
              </button>
            </div>

            {/* Content Panels */}
            {activeTab === 'scheduled' ? <ScheduledMailsView /> : <SentEmailsTable />}
          </div>
        )}
      </main>

      {/* Modals */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
      />

      <SenderModal
        isOpen={isSenderOpen}
        onClose={() => setIsSenderOpen(false)}
      />

      <SlackConnectModal
        isOpen={isSlackOpen}
        onClose={() => setIsSlackOpen(false)}
      />
    </div>
  );
};
