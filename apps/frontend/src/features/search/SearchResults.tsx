import React from 'react';
import { Search as SearchIcon, Mail, Calendar } from 'lucide-react';
import { useSearchEmails } from '../../hooks/useEmails';
import { StatusBadge } from '../../components/common/Badge';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { formatDate, truncate } from '../../lib/utils';

interface SearchResultsProps {
  query: string;
}

export const SearchResults: React.FC<SearchResultsProps> = ({ query }) => {
  const { data, isLoading } = useSearchEmails(query);

  if (isLoading) {
    return <LoadingSpinner size={28} text="Querying Elasticsearch cluster..." />;
  }

  const items = data?.items || [];
  const total = data?.total || 0;

  if (items.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl border border-dashed border-border text-muted-foreground text-xs">
        <SearchIcon size={20} className="mx-auto mb-2 opacity-50" />
        <p>No Elasticsearch documents matched "{query}"</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>Elasticsearch Results ({total} matches)</span>
        <span className="text-[10px] font-mono uppercase bg-primary/10 text-primary px-2 py-0.5 rounded">
          ES Index: emails
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Scheduled / Sent</th>
                <th className="px-4 py-3">ES Relevance</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item: any) => (
                <tr key={item.id} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Mail size={14} className="text-muted-foreground" />
                      <span>{item.recipientEmail}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground font-normal">
                    {truncate(item.subject, 50)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} />
                      <span>{formatDate(item.sentAt || item.scheduledAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    score: {typeof item._score === 'number' ? item._score.toFixed(2) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
