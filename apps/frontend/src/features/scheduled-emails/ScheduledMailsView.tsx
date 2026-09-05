import React, { useState } from 'react';
import { Mail, Users, Table as TableIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { EmailDetailsFolder } from './EmailDetailsFolder';
import { RecipientDetailsFolder } from './RecipientDetailsFolder';
import { RecipientTableFolder } from './RecipientTableFolder';
import { useEmailEvents } from '../../hooks/useEmails';

type AccordionSection = 'emails' | 'recipients' | 'table';

export const ScheduledMailsView: React.FC = () => {
  // Listen to real-time status updates via SSE across all scheduled mail views
  useEmailEvents();

  // Accordion state: only one section expanded at a time, defaulting to 'emails'
  const [expandedSection, setExpandedSection] = useState<AccordionSection | null>('emails');

  const toggleSection = (section: AccordionSection) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  return (
    <div className="space-y-4">
      {/* ROW 1: EMAIL DETAILS */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm transition-all hover:border-primary/30">
        <button
          type="button"
          onClick={() => toggleSection('emails')}
          className="w-full px-5 py-4 flex items-center justify-between text-left bg-card hover:bg-secondary/30 transition-colors focus:outline-none select-none"
          aria-expanded={expandedSection === 'emails'}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Mail size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Email Details
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                All composed email campaigns, attachments, delivery rates, and progress
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            {expandedSection === 'emails' ? (
              <ChevronUp size={18} className="text-primary transition-transform duration-200" />
            ) : (
              <ChevronDown size={18} className="transition-transform duration-200" />
            )}
          </div>
        </button>

        {expandedSection === 'emails' && (
          <div className="p-5 pt-3 border-t border-border/60 animate-in fade-in duration-200">
            <EmailDetailsFolder />
          </div>
        )}
      </div>

      {/* ROW 2: RECIPIENT DETAILS */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm transition-all hover:border-primary/30">
        <button
          type="button"
          onClick={() => toggleSection('recipients')}
          className="w-full px-5 py-4 flex items-center justify-between text-left bg-card hover:bg-secondary/30 transition-colors focus:outline-none select-none"
          aria-expanded={expandedSection === 'recipients'}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Users size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Recipient Details
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Real-time recipient dispatch status cards updated live via BullMQ &amp; SSE
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            {expandedSection === 'recipients' ? (
              <ChevronUp size={18} className="text-primary transition-transform duration-200" />
            ) : (
              <ChevronDown size={18} className="transition-transform duration-200" />
            )}
          </div>
        </button>

        {expandedSection === 'recipients' && (
          <div className="p-5 pt-3 border-t border-border/60 animate-in fade-in duration-200">
            <RecipientDetailsFolder />
          </div>
        )}
      </div>

      {/* ROW 3: TABLE */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm transition-all hover:border-primary/30">
        <button
          type="button"
          onClick={() => toggleSection('table')}
          className="w-full px-5 py-4 flex items-center justify-between text-left bg-card hover:bg-secondary/30 transition-colors focus:outline-none select-none"
          aria-expanded={expandedSection === 'table'}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <TableIcon size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Table
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Recipient-level delivery ledger with exact timestamps and infinite scroll
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            {expandedSection === 'table' ? (
              <ChevronUp size={18} className="text-primary transition-transform duration-200" />
            ) : (
              <ChevronDown size={18} className="transition-transform duration-200" />
            )}
          </div>
        </button>

        {expandedSection === 'table' && (
          <div className="p-5 pt-3 border-t border-border/60 animate-in fade-in duration-200">
            <RecipientTableFolder />
          </div>
        )}
      </div>
    </div>
  );
};

