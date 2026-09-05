import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { SlackStatus } from '../types';

export function useSlackStatus() {
  return useQuery<SlackStatus>({
    queryKey: ['slack', 'status'],
    queryFn: () => api.get<SlackStatus>('/slack/status'),
  });
}

export function useDisconnectSlack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/slack/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack', 'status'] });
    },
  });
}
