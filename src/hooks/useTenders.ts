// hooks/useTenders.ts
import { useQuery } from '@tanstack/react-query';

const fetchTenders = async () => {
  const res = await fetch('/api/tenders');
  if (!res.ok) throw new Error('Network response was not ok');
  return res.json();
};

export function useTenders() {
  return useQuery({ queryKey: ['tenders'], queryFn: fetchTenders });
}