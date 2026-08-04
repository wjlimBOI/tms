// hooks/useCostings.ts
import { useQuery } from '@tanstack/react-query';

interface CostingsFilters {
  groupBy: string;
  startDate?: Date;
  endDate?: Date;
  categoryId?: number;
  tenderId?: number;
}

export function useCostings(filters: CostingsFilters) {
  const queryKey = ['costings', filters];
  return useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('groupBy', filters.groupBy);
      if (filters.startDate) params.set('startDate', filters.startDate.toISOString().split('T')[0]);
      if (filters.endDate) params.set('endDate', filters.endDate.toISOString().split('T')[0]);
      if (filters.categoryId) params.set('categoryId', String(filters.categoryId));
      if (filters.tenderId) params.set('tenderId', String(filters.tenderId));
      const res = await fetch(`/api/analytics/costings?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}