import { useState, useCallback, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  DashboardLayout,
  ViolationLogsTable,
  ViolationFormModal,
  ViolationDetailModal,
  DeleteConfirmDialog,
  ImportModal,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApprehensions } from "@/hooks/useApprehensions";
import {
  createApprehension,
  updateApprehension,
  deleteApprehension,
} from "@/lib/api";
import { Plus, Search, X, Upload } from "lucide-react";
import { NCR_LOCATIONS } from "@/lib/locations";
import type { Apprehension, ApprehensionInput } from "@/types/apprehension";

export const Route = createFileRoute("/dashboard/violations")({
  component: ViolationLogsPage,
});

const AGENCIES = ["DLET", "DPWH", "PNP", "RLEU"];

const LOCATION_OPTIONS = Object.entries(NCR_LOCATIONS)
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
  .map(([key, data]) => ({ value: key, label: data.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

function ViolationLogsPage() {
  const { data, pagination, isLoading, refetch, setPage, setFilters } =
    useApprehensions({ limit: 10 });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [selectedRecord, setSelectedRecord] = useState<Apprehension | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAgency, setSelectedAgency] = useState("");
  const [violationFilter, setViolationFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [plateFilter, setPlateFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  // Stable refs so the debounce effect doesn't depend on callbacks/selects
  const setFiltersRef = useRef(setFilters);
  setFiltersRef.current = setFilters;

  const selectFiltersRef = useRef({ agency: "", location: "", date: "" });
  selectFiltersRef.current = {
    agency: selectedAgency,
    location: locationFilter,
    date: dateFilter,
  };

  // Debounce text inputs (driver name, plate number, violation)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      const { agency, location, date } = selectFiltersRef.current;
      setFiltersRef.current({
        driverName: searchTerm || undefined,
        plateNumber: plateFilter || undefined,
        violation: violationFilter || undefined,
        date: date || undefined,
        agency: agency && agency !== "all" ? agency : undefined,
        placeOfApprehension:
          location && location !== "all" ? location : undefined,
      });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, plateFilter, violationFilter]);

  // Build current filters (for immediate triggers like dropdowns/date)
  const applyFilters = useCallback(
    (overrides: Record<string, string> = {}) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const agency = overrides.agency ?? selectedAgency;
      const location = overrides.location ?? locationFilter;
      const date = overrides.date ?? dateFilter;
      setFilters({
        driverName: searchTerm || undefined,
        plateNumber: plateFilter || undefined,
        violation: violationFilter || undefined,
        date: date || undefined,
        agency: agency && agency !== "all" ? agency : undefined,
        placeOfApprehension:
          location && location !== "all" ? location : undefined,
      });
    },
    [
      searchTerm,
      selectedAgency,
      violationFilter,
      dateFilter,
      plateFilter,
      locationFilter,
      setFilters,
    ]
  );

  // Dropdown/date changes apply filters immediately
  const handleAgencyChange = useCallback(
    (value: string) => {
      setSelectedAgency(value);
      applyFilters({ agency: value });
    },
    [applyFilters]
  );

  const handleLocationChange = useCallback(
    (value: string) => {
      setLocationFilter(value);
      applyFilters({ location: value });
    },
    [applyFilters]
  );

  const handleDateChange = useCallback(
    (value: string) => {
      setDateFilter(value);
      applyFilters({ date: value });
    },
    [applyFilters]
  );

  const handleClearFilters = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchTerm("");
    setSelectedAgency("");
    setViolationFilter("");
    setDateFilter("");
    setPlateFilter("");
    setLocationFilter("");
    setFilters({});
  }, [setFilters]);

  // CRUD handlers
  const handleCreate = useCallback(() => {
    setSelectedRecord(null);
    setIsFormOpen(true);
  }, []);

  const handleView = useCallback((record: Apprehension) => {
    setSelectedRecord(record);
    setIsDetailOpen(true);
  }, []);

  const handleEdit = useCallback((record: Apprehension) => {
    setSelectedRecord(record);
    setIsFormOpen(true);
  }, []);

  const handleDeleteClick = useCallback((record: Apprehension) => {
    setSelectedRecord(record);
    setIsDeleteOpen(true);
  }, []);

  const handleFormSubmit = useCallback(
    async (formData: ApprehensionInput) => {
      setIsSubmitting(true);
      setError(null);

      try {
        if (selectedRecord) {
          await updateApprehension(selectedRecord._id, formData);
        } else {
          await createApprehension(formData);
        }
        setIsFormOpen(false);
        setSelectedRecord(null);
        refetch();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to save record";
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [selectedRecord, refetch]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedRecord) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await deleteApprehension(selectedRecord._id);
      setIsDeleteOpen(false);
      setSelectedRecord(null);
      refetch();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete record";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedRecord, refetch]);

  const hasActiveFilters =
    searchTerm ||
    (selectedAgency && selectedAgency !== "all") ||
    violationFilter ||
    dateFilter ||
    plateFilter ||
    (locationFilter && locationFilter !== "all");

  return (
    <DashboardLayout title="Violation Logs">
      <div className="space-y-4">
        {/* Header with Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Apprehension Records
            </h2>
            <p className="text-sm text-gray-500">
              Manage and track all violation records
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setImportFile(file);
                  setIsImportOpen(true);
                }
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Record
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Driver Name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Driver Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Plate Number */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Plate Number
              </label>
              <Input
                placeholder="Search by plate..."
                value={plateFilter}
                onChange={(e) => setPlateFilter(e.target.value)}
              />
            </div>

            {/* Violation */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Violation
              </label>
              <Input
                placeholder="Search by violation..."
                value={violationFilter}
                onChange={(e) => setViolationFilter(e.target.value)}
              />
            </div>

            {/* Date */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Date
              </label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>

            {/* Agency */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Agency
              </label>
              <Select
                value={selectedAgency}
                onValueChange={handleAgencyChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All agencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agencies</SelectItem>
                  {AGENCIES.map((agency) => (
                    <SelectItem key={agency} value={agency}>
                      {agency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Location
              </label>
              <Select
                value={locationFilter}
                onValueChange={handleLocationChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {LOCATION_OPTIONS.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear Button */}
            {hasActiveFilters && (
              <div className="flex items-end">
                <Button variant="outline" onClick={handleClearFilters}>
                  <X className="mr-1 h-4 w-4" />
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <ViolationLogsTable
          data={data}
          pagination={pagination}
          isLoading={isLoading}
          onPageChange={setPage}
          onView={handleView}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      </div>

      {/* Modals */}
      <ViolationFormModal
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setSelectedRecord(null);
        }}
        onSubmit={handleFormSubmit}
        initialData={selectedRecord}
        isLoading={isSubmitting}
      />

      <ViolationDetailModal
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) setSelectedRecord(null);
        }}
        data={selectedRecord}
      />

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={(open) => {
          setIsDeleteOpen(open);
          if (!open) setSelectedRecord(null);
        }}
        onConfirm={handleDeleteConfirm}
        isLoading={isSubmitting}
        title="Delete Violation Record"
        description={`Are you sure you want to delete case #${selectedRecord?.caseNumber}? This action cannot be undone.`}
      />

      <ImportModal
        open={isImportOpen}
        onOpenChange={(open) => {
          setIsImportOpen(open);
          if (!open) setImportFile(null);
        }}
        onComplete={refetch}
        file={importFile}
      />
    </DashboardLayout>
  );
}
