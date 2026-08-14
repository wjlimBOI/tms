'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CapExCalculator } from '@/components/capex/CapExCalculator';
import { isSuperUser } from '@/lib/roles';
import { useNotify } from '@/components/ui/notification-provider';

export default function BudgetPlannerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useNotify();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      if (status === 'loading') return;
      if (!session) {
        router.push('/login');
        return;
      }
      const roleIds = ((session.user as any)?.roleIds || []) as number[];
      if (isSuperUser(roleIds)) {
        setHasAccess(true);
        return;
      }
      try {
        const res = await fetch('/api/user/permissions');
        if (!res.ok) throw new Error('Failed to fetch permissions');
        const data = await res.json();
        if (data.permissions?.includes('budget_calculator')) {
          setHasAccess(true);
        } else {
          setHasAccess(false);
          toast.error("You don't have access to the Budget Planner. Contact an administrator if you believe this is a mistake.");
          router.push('/');
        }
      } catch {
        setHasAccess(true);
      }
    };
    checkAccess();
  }, [session, status, router]);

  if (status === 'loading' || hasAccess === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" role="status" aria-live="polite">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" aria-hidden="true" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (hasAccess === false) return null;

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <CapExCalculator />
      </div>
    </div>
  );
}
