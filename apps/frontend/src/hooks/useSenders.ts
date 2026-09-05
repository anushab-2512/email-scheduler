import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Sender } from '../types';

export function useSenders() {
  return useQuery<Sender[]>({
    queryKey: ['senders'],
    queryFn: () => api.get<Sender[]>('/senders'),
  });
}

export function useCreateSender() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      email: string;
      smtp_host: string;
      smtp_port: number;
      smtp_user: string;
      smtp_password: string;
    }) => api.post<Sender>('/senders', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['senders'] });
    },
  });
}
