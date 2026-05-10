import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  getTrends,
  getDistributions,
  getTimePatterns,
  getSummary,
} from "@/lib/api";
import type {
  TrendsSeries,
  DistributionItem,
  HourPattern,
  DayOfWeekPattern,
  SummaryResponse,
} from "@/types/analytics";
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
  Download,
} from "lucide-react";
import { generateReport } from "@/lib/generate-report";
import { NCR_LOCATIONS } from "@/lib/locations";

export const Route = createFileRoute("/dashboard/analytics")({
  component: AnalyticsPage,
});

const COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(262, 83%, 58%)",
  "hsl(330, 81%, 60%)",
  "hsl(24, 94%, 50%)",
  "hsl(142, 71%, 45%)",
  "hsl(47, 96%, 53%)",
  "hsl(199, 89%, 48%)",
  "hsl(0, 72%, 51%)",
];

const trendsConfig: ChartConfig = {
  count: { label: "Apprehensions", color: "hsl(221, 83%, 53%)" },
};

const barConfig: ChartConfig = {
  count: { label: "Count", color: "hsl(221, 83%, 53%)" },
};

const hourConfig: ChartConfig = {
  count: { label: "Apprehensions", color: "hsl(262, 83%, 58%)" },
};

const dayConfig: ChartConfig = {
  count: { label: "Apprehensions", color: "hsl(142, 71%, 45%)" },
};

const CITY_OPTIONS = Object.entries(NCR_LOCATIONS)
  .filter(([, data]) => !["EDSA", "GIL PUYAT", "ROXAS BLVD", "C5", "SLEX", "NLEX", "SKYWAY", "COMMONWEALTH AVE", "KATIPUNAN AVE", "ORTIGAS AVE", "AURORA BLVD", "ESPAÑA BLVD", "QUEZON AVE", "R10", "DAANG HARI", "QUIRINO AVE"].includes(data.name))
  .map(([key, data]) => ({ value: key, label: data.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

function getDefaultDateRange() {
  return { from: "2025-01-01", to: "2025-12-31" };
}

function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultRange] = useState(() => getDefaultDateRange());
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [selectedCity, setSelectedCity] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const cityFilter = selectedCity || undefined;

  const [trends, setTrends] = useState<TrendsSeries[]>([]);
  const [agencyDist, setAgencyDist] = useState<DistributionItem[]>([]);
  const [violationDist, setViolationDist] = useState<DistributionItem[]>([]);
  const [vehicleDist, setVehicleDist] = useState<DistributionItem[]>([]);
  const [hourPatterns, setHourPatterns] = useState<HourPattern[]>([]);
  const [dayPatterns, setDayPatterns] = useState<DayOfWeekPattern[]>([]);
  const [summary, setSummary] = useState<SummaryResponse["data"] | null>(null);

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const [
          trendsRes,
          agencyRes,
          violationRes,
          vehicleRes,
          patternsRes,
          summaryRes,
        ] = await Promise.all([
          getTrends({ dateFrom, dateTo, granularity: "day", placeOfApprehension: cityFilter }),
          getDistributions({ dateFrom, dateTo, groupBy: "agency", limit: 8, placeOfApprehension: cityFilter }),
          getDistributions({ dateFrom, dateTo, groupBy: "violation", limit: 8, placeOfApprehension: cityFilter }),
          getDistributions({ dateFrom, dateTo, groupBy: "mvType", limit: 6, placeOfApprehension: cityFilter }),
          getTimePatterns({ dateFrom, dateTo, placeOfApprehension: cityFilter }),
          getSummary({ dateFrom, dateTo, comparePrevious: true, placeOfApprehension: cityFilter }),
        ]);

        if (!abortControllerRef.current?.signal.aborted) {
          setTrends(trendsRes.data.series);
          setAgencyDist(agencyRes.data.items);
          setViolationDist(violationRes.data.items);
          setVehicleDist(vehicleRes.data.items);
          setHourPatterns(patternsRes.data.byHour);
          setDayPatterns(patternsRes.data.byDayOfWeek);
          setSummary(summaryRes.data);
        }
      } catch (err) {
        if (!abortControllerRef.current?.signal.aborted) {
          setError("Failed to load analytics data");
          console.error("Failed to fetch analytics:", err);
        }
      } finally {
        if (!abortControllerRef.current?.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [dateFrom, dateTo, cityFilter]);

  return (
    <DashboardLayout title="Analytics">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label
              htmlFor="date-from"
              className="text-sm font-medium text-gray-700"
            >
              From:
            </label>
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              min="2025-01-01"
              max="2025-12-31"
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="date-to"
              className="text-sm font-medium text-gray-700"
            >
              To:
            </label>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              min="2025-01-01"
              max="2025-12-31"
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="city-select"
              className="text-sm font-medium text-gray-700"
            >
              Location:
            </label>
            <select
              id="city-select"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">All Locations</option>
              {CITY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {loading && (
            <Loader2
              className="h-4 w-4 animate-spin text-gray-500"
              aria-label="Loading"
            />
          )}
          <button
            onClick={() =>
              generateReport({
                dateFrom,
                dateTo,
                summary,
                agencyDist,
                violationDist,
                vehicleDist,
                hourPatterns,
                dayPatterns,
              })
            }
            disabled={loading}
            className="ml-auto flex items-center gap-2 rounded-md bg-[#1a3a5c] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#15304d] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download Report
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Apprehensions</CardDescription>
                <CardTitle className="text-3xl">
                  {summary.current.total.toLocaleString()}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.growth && (
                  <div className="flex items-center gap-1 text-sm">
                    {summary.growth.percentage >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-red-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-green-500" />
                    )}
                    <span
                      className={
                        summary.growth.percentage >= 0
                          ? "text-red-500"
                          : "text-green-500"
                      }
                    >
                      {Math.abs(summary.growth.percentage).toFixed(1)}%
                    </span>
                    <span className="text-gray-500">vs previous period</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Current Period</CardDescription>
                <CardTitle className="text-lg">
                  {new Date(summary.current.period.from).toLocaleDateString()} -{" "}
                  {new Date(summary.current.period.to).toLocaleDateString()}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  {summary.current.total.toLocaleString()} apprehensions
                </p>
              </CardContent>
            </Card>

            {summary.previous && (
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Previous Period</CardDescription>
                  <CardTitle className="text-lg">
                    {new Date(summary.previous.period.from).toLocaleDateString()}{" "}
                    - {new Date(summary.previous.period.to).toLocaleDateString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500">
                    {summary.previous.total.toLocaleString()} apprehensions
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Trends Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Apprehension Trends</CardTitle>
            <CardDescription>Daily apprehensions over time</CardDescription>
          </CardHeader>
          <CardContent>
            {trends.length > 0 ? (
              <ChartContainer config={trendsConfig} className="h-[300px] w-full">
                <AreaChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) =>
                      new Date(value).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) =>
                          new Date(value).toLocaleDateString()
                        }
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--color-count)"
                    fill="var(--color-count)"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Distribution Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* By Agency */}
          <Card>
            <CardHeader>
              <CardTitle>By Agency</CardTitle>
              <CardDescription>Top agencies by apprehension count</CardDescription>
            </CardHeader>
            <CardContent>
              {agencyDist.length > 0 ? (
                <ChartContainer config={barConfig} className="h-[300px] w-full">
                  <BarChart data={agencyDist} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      width={80}
                      tick={{ fontSize: 12 }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {agencyDist.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-gray-500">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* By Violation */}
          <Card>
            <CardHeader>
              <CardTitle>By Violation Type</CardTitle>
              <CardDescription>Top violations by count</CardDescription>
            </CardHeader>
            <CardContent>
              {violationDist.length > 0 ? (
                <ChartContainer config={barConfig} className="h-[400px] w-full">
                  <BarChart
                    data={violationDist}
                    layout="vertical"
                    margin={{ left: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      width={150}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value: string) =>
                        value.length > 20 ? `${value.slice(0, 20)}...` : value
                      }
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {violationDist.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[400px] items-center justify-center text-gray-500">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Vehicle Type Pie Chart & Time Patterns */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Vehicle Type Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Vehicle Types</CardTitle>
              <CardDescription>Distribution by vehicle type</CardDescription>
            </CardHeader>
            <CardContent>
              {vehicleDist.length > 0 ? (
                <ChartContainer
                  config={barConfig}
                  className="mx-auto h-[250px] w-full"
                >
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={vehicleDist}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ label }) => label}
                    >
                      {vehicleDist.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-gray-500">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* By Hour */}
          <Card>
            <CardHeader>
              <CardTitle>By Hour of Day</CardTitle>
              <CardDescription>When violations occur</CardDescription>
            </CardHeader>
            <CardContent>
              {hourPatterns.length > 0 ? (
                <ChartContainer config={hourConfig} className="h-[250px] w-full">
                  <BarChart data={hourPatterns}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h) => `${h}:00`}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis tickLine={false} axisLine={false} hide />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(h) => `${h}:00 - ${h}:59`}
                        />
                      }
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--color-count)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-gray-500">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* By Day of Week */}
          <Card>
            <CardHeader>
              <CardTitle>By Day of Week</CardTitle>
              <CardDescription>Weekly patterns</CardDescription>
            </CardHeader>
            <CardContent>
              {dayPatterns.length > 0 ? (
                <ChartContainer config={dayConfig} className="h-[250px] w-full">
                  <BarChart data={dayPatterns}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(label) => label.slice(0, 3)}
                    />
                    <YAxis tickLine={false} axisLine={false} hide />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="count"
                      fill="var(--color-count)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-gray-500">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
