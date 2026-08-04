'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
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
  const [groupBy, setGroupBy] = useState<'monthly' | 'yearly' | 'category' | 'item' | 'tender'>('monthly');
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });

  const { data, isLoading, error } = useQuery<CostingsResponse>({
    queryKey: ['costings', groupBy, dateRange.start, dateRange.end],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('groupBy', groupBy);
      if (dateRange.start) params.set('startDate', dateRange.start.toISOString().split('T')[0]);
      if (dateRange.end) params.set('endDate', dateRange.end.toISOString().split('T')[0]);
      const res = await fetch(`/api/analytics/costings?${params}`);
      if (!res.ok) throw new Error('Failed to fetch costings');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a1228]">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 dark:cyan-300/70">Loading costings data...</p>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a1228]">
      <div className="text-red-600 dark:text-red-400">Error: {error.message}</div>
    </div>
  );
  
  if (!data) return null;

  const chartData = data.data;
  const summary = data.summary;

  return (
    <div className="container mx-auto p-6 space-y-8 bg-gray-50 dark:bg-[#0a1228] min-h-screen">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">BQ Costings Analytics</h1>

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
          <TabsList className="bg-gray-100 dark:bg-gray-800">
            <TabsTrigger 
              value="monthly"
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white"
            >
              Monthly
            </TabsTrigger>
            <TabsTrigger 
              value="yearly"
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white"
            >
              Yearly
            </TabsTrigger>
            <TabsTrigger 
              value="category"
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white"
            >
              By Category
            </TabsTrigger>
            <TabsTrigger 
              value="item"
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white"
            >
              Top Items
            </TabsTrigger>
            <TabsTrigger 
              value="tender"
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white"
            >
              Tender Comparison
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <CardHeader><CardTitle className="text-gray-700 dark:text-gray-300">Total Spent</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">${summary.totalSpent.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <CardHeader><CardTitle className="text-gray-700 dark:text-gray-300">Total Budget</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">${summary.totalBudget.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <CardHeader><CardTitle className="text-gray-700 dark:text-gray-300">Variance</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.variance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              ${summary.variance.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <CardHeader><CardTitle className="text-gray-700 dark:text-gray-300">Budget Used</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary.percentUsed.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <TabsContent value="monthly">
        <Card className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <CardHeader><CardTitle className="text-gray-700 dark:text-gray-300">Monthly Spending</CardTitle></CardHeader>
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
        <Card className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <CardHeader><CardTitle className="text-gray-700 dark:text-gray-300">Yearly Spending</CardTitle></CardHeader>
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
        <Card className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <CardHeader><CardTitle className="text-gray-700 dark:text-gray-300">Spending by Category</CardTitle></CardHeader>
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
        <Card className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <CardHeader><CardTitle className="text-gray-700 dark:text-gray-300">Top 50 Most Expensive Items</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 dark:border-gray-700">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className="p-2 text-left text-gray-700 dark:text-gray-300">Item Description</th>
                    <th className="p-2 text-right text-gray-700 dark:text-gray-300">Total Spent</th>
                    <th className="p-2 text-right text-gray-700 dark:text-gray-300"># of Submissions</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((item: any) => (
                    <tr key={item.description} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="p-2 text-gray-900 dark:text-white">{item.description}</td>
                      <td className="p-2 text-right text-gray-900 dark:text-white">${item.total_spent.toLocaleString()}</td>
                      <td className="p-2 text-right text-gray-900 dark:text-white">{item.times_used}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tender">
        <Card className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <CardHeader><CardTitle className="text-gray-700 dark:text-gray-300">Budget vs Actual per Tender</CardTitle></CardHeader>
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