export interface Driver {
  lastName: string;
  firstName: string;
}

export interface ConfiscatedItem {
  type: string | null;
  number: string | null;
}

export interface Apprehension {
  _id: string;
  dateOfSubmission: string;
  daysInterval: number | null;
  dateOfApprehension: string;
  timeOfApprehension: string;
  agency: string;
  apprehendingOfficer: string;
  caseNumber: string;
  driver: Driver;
  violation: string;
  confiscatedItem: ConfiscatedItem;
  restrictionCode: string | null;
  conditions: string | null;
  nationality: string | null;
  gender: string | null;
  mvType: string | null;
  plateNumber: string;
  placeOfApprehension: string;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApprehensionsResponse {
  data: Apprehension[];
  pagination: Pagination;
}

export interface ApprehensionFilters {
  page?: number;
  limit?: number;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  agency?: string;
  violation?: string;
  plateNumber?: string;
  driverName?: string;
  placeOfApprehension?: string;
}

// Stats endpoint types
export interface StatsFilters {
  month?: string;
  dateFrom?: string;
  dateTo?: string;
  agency?: string;
  violation?: string;
  placeOfApprehension?: string;
  topLimit?: number;
}

export interface StatsData {
  total: number;
  topAgencies: { agency: string; count: number }[];
  topViolations: { violation: string; count: number }[];
  topLocations: { location: string; count: number }[];
}

export interface StatsResponse {
  data: StatsData;
}

// Input types for CRUD operations
export interface ApprehensionInput {
  dateOfSubmission: string;
  dateOfApprehension: string;
  timeOfApprehension: string;
  agency: string;
  apprehendingOfficer: string;
  caseNumber: string;
  driver: Driver;
  violation: string;
  confiscatedItem: ConfiscatedItem;
  restrictionCode: string;
  conditions: string;
  nationality: string;
  gender: string;
  mvType: string;
  plateNumber: string;
  placeOfApprehension: string;
  remarks: string;
}

export interface ApprehensionResponse {
  data: Apprehension;
}

export interface BulkImportError {
  row: number;
  error: string;
}

export interface BulkImportResponse {
  data: {
    total: number;
    imported: number;
    failed: number;
    errors: BulkImportError[];
  };
}
