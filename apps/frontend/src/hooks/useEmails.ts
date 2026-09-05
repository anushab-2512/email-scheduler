import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Email, PaginatedResult, ScheduleEmailPayload, CampaignWithStats, RecipientItem } from '../types';

export function useCampaigns(page = 1, limit = 20) {
  return useQuery<PaginatedResult<CampaignWithStats>>({
    queryKey: ['campaigns', page, limit],
    queryFn: () => api.get<PaginatedResult<CampaignWithStats>>(`/emails/campaigns?page=${page}&limit=${limit}`),
    refetchInterval: 3000,
  });
}

export function useInfiniteCampaigns(limit = 6) {
  return useInfiniteQuery<PaginatedResult<CampaignWithStats>>({
    queryKey: ['campaigns', 'infinite', limit],
    queryFn: ({ pageParam = 1 }) =>
      api.get<PaginatedResult<CampaignWithStats>>(`/emails/campaigns?page=${pageParam}&limit=${limit}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const hasMore = lastPage.hasMore ?? (lastPage.page < lastPage.totalPages);
      if (hasMore) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    refetchInterval: 3000,
  });
}

export function useRecipients(page = 1, limit = 50) {
  return useQuery<PaginatedResult<RecipientItem>>({
    queryKey: ['recipients', page, limit],
    queryFn: () => api.get<PaginatedResult<RecipientItem>>(`/emails/recipients?page=${page}&limit=${limit}`),
    refetchInterval: 3000,
  });
}

export function useInfiniteRecipients(limit = 30) {
  return useInfiniteQuery<PaginatedResult<RecipientItem>>({
    queryKey: ['recipients', 'infinite', limit],
    queryFn: ({ pageParam = 1 }) =>
      api.get<PaginatedResult<RecipientItem>>(`/emails/recipients?page=${pageParam}&limit=${limit}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.totalPages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    refetchInterval: 3000,
  });
}

export function useEmailEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/emails/events', { withCredentials: true });

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'STATUS_UPDATE' || data.type === 'CAMPAIGN_DELETED') {
            if (data.type === 'CAMPAIGN_DELETED' && data.campaignId) {
              const cid = data.campaignId;
              queryClient.setQueriesData({ queryKey: ['campaigns'] }, (old: any) => {
                if (!old) return old;
                if (old.pages) {
                  return {
                    ...old,
                    pages: old.pages.map((p: any) => ({
                      ...p,
                      total: Math.max(0, (p.total || 0) - 1),
                      items: (p.items || []).filter((item: any) => item.id !== cid),
                    })),
                  };
                }
                if (old.items) {
                  return {
                    ...old,
                    total: Math.max(0, (old.total || 0) - 1),
                    items: old.items.filter((item: any) => item.id !== cid),
                  };
                }
                return old;
              });

              queryClient.setQueriesData({ queryKey: ['recipients'] }, (old: any) => {
                if (!old) return old;
                if (old.pages) {
                  return {
                    ...old,
                    pages: old.pages.map((p: any) => ({
                      ...p,
                      items: (p.items || []).filter((item: any) => item.campaign_id !== cid),
                    })),
                  };
                }
                if (old.items) {
                  return {
                    ...old,
                    items: old.items.filter((item: any) => item.campaign_id !== cid),
                  };
                }
                return old;
              });

              queryClient.setQueriesData({ queryKey: ['emails'] }, (old: any) => {
                if (!old) return old;
                if (old.items) {
                  return {
                    ...old,
                    items: old.items.filter((item: any) => item.campaign_id !== cid && item.id !== cid),
                  };
                }
                return old;
              });
            }

            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            queryClient.invalidateQueries({ queryKey: ['recipients'] });
            queryClient.invalidateQueries({ queryKey: ['emails'] });
          }
        } catch {
          // ignore
        }
      };

      eventSource.onerror = () => {
        // Will auto reconnect
      };
    } catch {
      // ignore
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [queryClient]);
}

export function useScheduledEmails(page = 1, limit = 50) {
  return useQuery<PaginatedResult<Email>>({
    queryKey: ['emails', 'scheduled', page, limit],
    queryFn: () => api.get<PaginatedResult<Email>>(`/emails/scheduled?page=${page}&limit=${limit}`),
    refetchInterval: 3000, // Poll every 3 seconds for live scheduler dashboard visibility
  });
}

export function useSentEmails(page = 1, limit = 50) {
  return useQuery<PaginatedResult<Email>>({
    queryKey: ['emails', 'sent', page, limit],
    queryFn: () => api.get<PaginatedResult<Email>>(`/emails/sent?page=${page}&limit=${limit}`),
    refetchInterval: 3000,
  });
}

export function useSearchEmails(query: string) {
  return useQuery<{ items: any[]; total: number }>({
    queryKey: ['emails', 'search', query],
    queryFn: () => api.get<{ items: any[]; total: number }>(`/emails/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
  });
}

export function useScheduleEmails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ScheduleEmailPayload) =>
      api.post('/emails/schedule', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
    },
  });
}

export function useParseCsv() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post<{ emails: string[]; count: number }>('/emails/parse-csv', formData);
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/emails/campaigns/${id}`),
    onSuccess: (_, id) => {
      // Optimistically remove from all caches
      queryClient.setQueriesData({ queryKey: ['campaigns'] }, (old: any) => {
        if (!old) return old;
        if (old.pages) {
          return {
            ...old,
            pages: old.pages.map((p: any) => ({
              ...p,
              items: (p.items || []).filter((c: any) => c.id !== id),
            })),
          };
        }
        if (old.items) {
          return {
            ...old,
            total: Math.max(0, (old.total || 0) - 1),
            items: old.items.filter((item: any) => item.id !== id),
          };
        }
        return old;
      });

      queryClient.setQueriesData({ queryKey: ['recipients'] }, (old: any) => {
        if (!old) return old;
        if (old.pages) {
          return {
            ...old,
            pages: old.pages.map((p: any) => ({
              ...p,
              items: (p.items || []).filter((item: any) => item.campaign_id !== id && item.id !== id),
            })),
          };
        }
        if (old.items) {
          return {
            ...old,
            items: old.items.filter((item: any) => item.campaign_id !== id && item.id !== id),
          };
        }
        return old;
      });

      queryClient.setQueriesData({ queryKey: ['emails'] }, (old: any) => {
        if (!old) return old;
        if (old.items) {
          return {
            ...old,
            items: old.items.filter((item: any) => item.campaign_id !== id && item.id !== id),
          };
        }
        return old;
      });

      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });
}
