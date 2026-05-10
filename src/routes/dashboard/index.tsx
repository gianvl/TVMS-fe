import { useMemo, useCallback, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Calendar, MapPin } from "lucide-react";
import {
  DashboardLayout,
  StatsCard,
  ViolationMap,
  ViolationTable,
} from "@/components/dashboard";
import type { LocationAggregation } from "@/components/dashboard/violation-map";
import { useAuth } from "@/hooks/useAuth";
import { useApprehensions, useStats } from "@/hooks/useApprehensions";
import { NCR_LOCATIONS, normalizeLocation } from "@/lib/locations";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

function getDefaultDateRange() {
  return { from: "2025-01-01", to: "2025-12-31" };
}

const CITY_OPTIONS = Object.entries(NCR_LOCATIONS)
  .filter(
    ([, data]) =>
      ![
        "EDSA",
        "GIL PUYAT",
        "ROXAS BLVD",
        "C5",
        "SLEX",
        "NLEX",
        "SKYWAY",
        "COMMONWEALTH AVE",
        "KATIPUNAN AVE",
        "ORTIGAS AVE",
        "AURORA BLVD",
        "ESPAÑA BLVD",
        "QUEZON AVE",
        "R10",
        "DAANG HARI",
        "QUIRINO AVE",
      ].includes(data.name)
  )
  .map(([key, data]) => ({ value: key, label: data.name, coords: data.coords }))
  .sort((a, b) => a.label.localeCompare(b.label));

// Map location names from API to coordinates (aggregates duplicates)
function mapLocationsToCoords(
  locations: { location: string; count: number }[]
): LocationAggregation[] {
  const aggregated = new Map<string, { name: string; coords: [number, number]; count: number }>();

  for (const item of locations) {
    const normalized = normalizeLocation(item.location);
    if (normalized && NCR_LOCATIONS[normalized]) {
      const existing = aggregated.get(normalized);
      if (existing) {
        existing.count += item.count;
      } else {
        aggregated.set(normalized, {
          name: NCR_LOCATIONS[normalized].name,
          coords: NCR_LOCATIONS[normalized].coords,
          count: item.count,
        });
      }
    }
  }

  return Array.from(aggregated.entries()).map(([key, data]) => ({
    key,
    ...data,
  }));
}

function DashboardPage() {
  const { user } = useAuth();
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [selectedCity, setSelectedCity] = useState("");

  const cityFilter = selectedCity || undefined;

  // Table data - paginated for display
  const {
    data: tableData,
    pagination,
    isLoading: tableLoading,
    setPage,
  } = useApprehensions({
    limit: 10,
    dateFrom,
    dateTo,
    placeOfApprehension: cityFilter,
  });

  // Stats data - from dedicated endpoint
  const { stats, isLoading: statsLoading } = useStats({
    dateFrom,
    dateTo,
    topLimit: 10,
    placeOfApprehension: cityFilter,
  });

  const handleCityChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedCity(e.target.value);
    },
    []
  );

  // Get coordinates for selected city to focus map
  const focusCoords = useMemo(() => {
    if (!selectedCity) return null;
    const city = CITY_OPTIONS.find((c) => c.value === selectedCity);
    return city?.coords ?? null;
  }, [selectedCity]);

  // Map locations from stats to coordinates
  const locationAggregations = useMemo(
    () => (stats?.topLocations ? mapLocationsToCoords(stats.topLocations) : []),
    [stats?.topLocations]
  );

  const dateRangeLabel = `${new Date(dateFrom).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - ${new Date(dateTo).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const isLoading = tableLoading || statsLoading;

  return (
    <DashboardLayout
      title="Operations Overview"
      headerRight={
        <div className="text-right text-sm">
          <p className="font-semibold text-[#1a3a5c]">{user?.username}</p>
          <p className="text-gray-500">ID: {user?.id}</p>
        </div>
      }
    >
      {/* Filter Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a3a5c]/10">
              <Calendar className="h-4 w-4 text-[#1a3a5c]" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">From</p>
              <input
                type="date"
                value={dateFrom}
                min="2025-01-01"
                max="2025-12-31"
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={isLoading}
                className="mt-0.5 cursor-pointer rounded border-none bg-transparent p-0 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div>
              <p className="text-xs font-medium text-gray-500">To</p>
              <input
                type="date"
                value={dateTo}
                min="2025-01-01"
                max="2025-12-31"
                onChange={(e) => setDateTo(e.target.value)}
                disabled={isLoading}
                className="mt-0.5 cursor-pointer rounded border-none bg-transparent p-0 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a3a5c]/10">
              <MapPin className="h-4 w-4 text-[#1a3a5c]" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">City</p>
              <select
                value={selectedCity}
                onChange={handleCityChange}
                disabled={isLoading}
                className="mt-0.5 w-40 cursor-pointer rounded border-none bg-transparent p-0 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">All Cities</option>
                {CITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {stats && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
            <span>Data as of {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatsCard
          value={stats?.total.toLocaleString() ?? "-"}
          label="TOTAL APPREHENSIONS"
          subtitle={dateRangeLabel}
        />
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">TOP VIOLATIONS</p>
            <Link
              to="/dashboard/analytics"
              className="text-xs font-medium text-[#1a3a5c] hover:underline"
            >
              See more
            </Link>
          </div>
          <ul className="mt-2 space-y-1">
            {stats?.topViolations.slice(0, 3).map((v, i) => (
              <li
                key={v.violation}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate font-semibold text-[#1a3a5c]">
                  {i + 1}. {v.violation}
                </span>
                <span className="shrink-0 text-xs text-gray-400">
                  {v.count.toLocaleString()}
                </span>
              </li>
            )) ?? (
              <li className="text-sm text-gray-400">-</li>
            )}
          </ul>
        </div>
      </div>

      {/* Map and Table Grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Map Section */}
        <div className="xl:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="font-semibold text-gray-900">
                Top Apprehension Locations
              </h3>
              <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                LIVE DATA
              </span>
            </div>
            <div className="h-[400px] p-2 sm:h-[500px]">
              <ViolationMap locations={locationAggregations} isLoading={statsLoading} focusCoords={focusCoords} />
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="xl:col-span-1">
          <ViolationTable
            data={tableData}
            pagination={pagination}
            isLoading={tableLoading}
            onPageChange={setPage}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
