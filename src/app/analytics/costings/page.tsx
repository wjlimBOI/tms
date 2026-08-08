'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useNotify } from '@/components/ui/notification-provider';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28CF6'];

interface CostingsResponse {
  data: any[];
  summary: {
    totalBudget: number;
    totalSpent: number;
    variance: number;
    percentUsed: number;
  };
}

export default function CostingsDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useNotify();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [groupBy, setGroupBy] = useState<'monthly' | 'yearly' | 'category' | 'item' | 'tender'>('monthly');
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });

  useEffect(() => {
    const checkAccess = async () => {
      if (status === 'loading') return;
      if (!session) {
        router.push('/login');
        return;
      }
      const userRole = (session.user as any)?.role_id;
      if (userRole === 1) {
        setHasAccess(true);
        return;
      }
      try {
        const res = await fetch('/api/user/permissions');
        if (!res.ok) throw new Error('Failed to fetch permissions');
        const data = await res.json();
        if (data.permissions?.includes('view')) {
          setHasAccess(true);
        } else {
          setHasAccess(false);
          toast.error("You don't have access to Costings Analytics. Contact an administrator if you believe this is a mistake.");
          router.push('/');
        }
      } catch {
        setHasAccess(true);
      }
    };
    checkAccess();
  }, [session, status, router]);

  const { data, isLoading, error } = useQuery<CostingsResponse>({
    queryKey: ['costings', groupBy, dateRange.start, dateRange.end],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('groupBy', groupBy);
      if (dateRange.start) params.set('startDate', dateRange.start.toISOString().split('T')[0]);
      if (dateRange.end) params.set('endDate', dateRange.end.toISOString().split('T')[0]);
      const res = await fetch(`/api/analytics/costings?${params}`);
      if (res.status === 401 || res.status === 403) {
        toast.error("You don't have access to Costings Analytics. Contact an administrator if you believe this is a mistake.");
        router.push('/');
        throw new Error('Access denied');
      }
      if (!res.ok) throw new Error('Failed to fetch costings');
      return res.json();
    },
    enabled: hasAccess === true,
    staleTime: 5 * 60 * 1000,
  });

  if (status === 'loading' || hasAccess === null || (hasAccess && isLoading)) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" role="status" aria-live="polite">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" aria-hidden="true" />
        <p className="text-gray-500">Loading costings data...</p>
      </div>
    </div>
  );

  if (hasAccess === false) return null;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-red-600 font-medium">We couldn't load the costings data.</p>
        <p className="text-gray-500 text-sm mt-1">Please refresh the page or try again later.</p>
      </div>
    </div>
  );

  if (!data) return null;

  const chartData = data.data;
  const summary = data.summary;

  return (
    <div className="container mx-auto p-6 space-y-8 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-900">BQ Costings Analytics</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="w-80">
          <DateRangePicker
            label="Date Range"
            startDate={dateRange.start}
            endDate={dateRange.end}
            onRangeChange={({ start, end }) => setDateRange({ start, end })}
            placeholder="Select date range"
          />
        </div>
        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
          <TabsList className="bg-gray-100">
            <TabsTrigger 
              value="monthly"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900"
            >
              Monthly
            </TabsTrigger>
            <TabsTrigger 
              value="yearly"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900"
            >
              Yearly
            </TabsTrigger>
            <TabsTrigger 
              value="category"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900"
            >
              By Category
            </TabsTrigger>
            <TabsTrigger 
              value="item"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900"
            >
              Top Items
            </TabsTrigger>
            <TabsTrigger 
              value="tender"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900"
            >
              Tender Comparison
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white border border-gray-200">
          <CardHeader><CardTitle className="text-gray-700">Total Spent</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">${summary.totalSpent.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-gray-200">
          <CardHeader><CardTitle className="text-gray-700">Total Budget</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">${summary.totalBudget.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-gray-200">
          <CardHeader><CardTitle className="text-gray-700">Variance</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${summary.variance.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border border-gray-200">
          <CardHeader><CardTitle className="text-gray-700">Budget Used</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{summary.percentUsed.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <TabsContent value="monthly">
        <Card className="bg-white border border-gray-200">
          <CardHeader><CardTitle className="text-gray-700">Monthly Spending</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" />
                <XAxis 
                  dataKey="period" 
                  tickFormatter={(tick: any) => new Date(tick).toLocaleDateString()}
                  tick={{ fill: 'currentColor' }}
                  stroke="currentColor"
                />
                <YAxis 
                  tickFormatter={(value: any) => `$${value.toLocaleString()}`}
                  tick={{ fill: 'currentColor' }}
                  stroke="currentColor"
                />
                <Tooltip 
                  formatter={(value: any) => `$${value.toLocaleString()}`}
                  contentStyle={{ backgroundColor: 'var(--tooltip-bg, white)', color: 'var(--tooltip-text, black)' }}
                />
                <Legend wrapperStyle={{ color: 'currentColor' }} />
                <Line type="monotone" dataKey="total" stroke="#8884d8" name="Amount" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="yearly">
        <Card className="bg-white border border-gray-200">
          <CardHeader><CardTitle className="text-gray-700">Yearly Spending</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" />
                <XAxis 
                  dataKey="period" 
                  tickFormatter={(tick: any) => new Date(tick).getFullYear().toString()}
                  tick={{ fill: 'currentColor' }}
                  stroke="currentColor"
                />
                <YAxis 
                  tickFormatter={(value: any) => `$${value.toLocaleString()}`}
                  tick={{ fill: 'currentColor' }}
                  stroke="currentColor"
                />
                <Tooltip 
                  formatter={(value: any) => `$${value.toLocaleString()}`}
                  contentStyle={{ backgroundColor: 'var(--tooltip-bg, white)', color: 'var(--tooltip-text, black)' }}
                />
                <Legend wrapperStyle={{ color: 'currentColor' }} />
                <Line type="monotone" dataKey="total" stroke="#82ca9d" name="Amount" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="category">
        <Card className="bg-white border border-gray-200">
          <CardHeader><CardTitle className="text-gray-700">Spending by Category</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="total"
                  nameKey="category_name"
                  cx="50%"
                  cy="50%"
                  outerRadius={130}
                  label
                >
                  {chartData.map((entry: any, idx: number) => (
                    <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any) => `$${value.toLocaleString()}`}
                  contentStyle={{ backgroundColor: 'var(--tooltip-bg, white)', color: 'var(--tooltip-text, black)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="item">
        <Card className="bg-white border border-gray-200">
          <CardHeader><CardTitle className="text-gray-700">Top 50 Most Expensive Items</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2 text-left text-gray-700">Item Description</th>
                    <th className="p-2 text-right text-gray-700">Total Spent</th>
                    <th className="p-2 text-right text-gray-700"># of Submissions</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((item: any) => (
                    <tr key={item.description} className="border-t border-gray-200">
                      <td className="p-2 text-gray-900">{item.description}</td>
                      <td className="p-2 text-right text-gray-900">${item.total_spent.toLocaleString()}</td>
                      <td className="p-2 text-right text-gray-900">{item.times_used}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tender">
        <Card className="bg-white border border-gray-200">
          <CardHeader><CardTitle className="text-gray-700">Budget vs Actual per Tender</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={500}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" />
                <XAxis 
                  type="number" 
                  tickFormatter={(v: any) => `$${v / 1000}k`}
                  tick={{ fill: 'currentColor' }}
                  stroke="currentColor"
                />
                <YAxis 
                  type="category" 
                  dataKey="tender_name" 
                  width={150}
                  tick={{ fill: 'currentColor' }}
                  stroke="currentColor"
                />
                <Tooltip 
                  formatter={(value: any) => `$${value.toLocaleString()}`}
                  contentStyle={{ backgroundColor: 'var(--tooltip-bg, white)', color: 'var(--tooltip-text, black)' }}
                />
                <Legend wrapperStyle={{ color: 'currentColor' }} />
                <Bar dataKey="estimated_budget" fill="#8884d8" name="Budget" />
                <Bar dataKey="actual_spent" fill="#82ca9d" name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>
    </div>
  );
}