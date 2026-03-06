import axios from "axios";
import { authStore } from "@/stores/auth";
import type {
  ApprehensionsResponse,
  ApprehensionFilters,
  StatsResponse,
  StatsFilters,
  ApprehensionInput,
  ApprehensionResponse,
  BulkImportResponse,
} from "@/types/apprehension";
import type {
  TrendsFilters,
  TrendsResponse,
  DistributionsFilters,
  DistributionsResponse,
  TimePatternsFilters,
  TimePatternsResponse,
  SummaryFilters,
  SummaryResponse,
} from "@/types/analytics";
import type {
  UsersResponse,
  UserResponse,
  UserFilters,
  CreateUserInput,
  UpdateUserInput,
} from "@/types/user";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL environment variable is not defined");
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach token to requests
api.interceptors.request.use((config) => {
  const token = authStore.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401 (skip for auth endpoints)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = originalRequest?.url?.startsWith("/auth/");

    // Don't retry auth endpoints (login, refresh, logout)
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;

      try {
        const { data } = await api.post("/auth/refresh");
        authStore.setAccessToken(data.data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch {
        authStore.clear();
        window.location.href = "/";
      }
    }

    return Promise.reject(error);
  }
);

// Auth API functions
export async function login(username: string, password: string) {
  const { data } = await api.post("/auth/login", { username, password });
  authStore.setAccessToken(data.data.accessToken);
  return data;
}

export async function logout() {
  try {
    await api.post("/auth/logout");
  } finally {
    authStore.clear();
  }
}

export async function refreshToken() {
  const { data } = await api.post("/auth/refresh");
  authStore.setAccessToken(data.data.accessToken);
  return data;
}

// Initialize auth state on app load
export async function initAuth() {
  try {
    const { data } = await api.post("/auth/refresh");
    authStore.setAccessToken(data.data.accessToken);
  } catch {
    // No valid session, user will need to login
    authStore.clear();
  } finally {
    authStore.setInitialized(true);
  }
}

// Apprehensions API
export async function getApprehensions(
  filters: ApprehensionFilters = {}
): Promise<ApprehensionsResponse> {
  const params = new URLSearchParams();

  if (filters.page) params.append("page", String(filters.page));
  if (filters.limit) params.append("limit", String(filters.limit));
  if (filters.date) params.append("date", filters.date);
  if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.append("dateTo", filters.dateTo);
  if (filters.agency) params.append("agency", filters.agency);
  if (filters.violation) params.append("violation", filters.violation);
  if (filters.plateNumber) params.append("plateNumber", filters.plateNumber);
  if (filters.driverName) params.append("driverName", filters.driverName);
  if (filters.placeOfApprehension)
    params.append("placeOfApprehension", filters.placeOfApprehension);

  const { data } = await api.get(`/apprehensions?${params.toString()}`);
  return data;
}

// Stats API
export async function getStats(filters: StatsFilters = {}): Promise<StatsResponse> {
  const params = new URLSearchParams();

  if (filters.month) params.append("month", filters.month);
  if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.append("dateTo", filters.dateTo);
  if (filters.agency) params.append("agency", filters.agency);
  if (filters.violation) params.append("violation", filters.violation);
  if (filters.placeOfApprehension) params.append("placeOfApprehension", filters.placeOfApprehension);
  if (filters.topLimit) params.append("topLimit", String(filters.topLimit));

  const { data } = await api.get(`/apprehensions/stats?${params.toString()}`);
  return data;
}

// Apprehension CRUD operations
export async function createApprehension(
  input: ApprehensionInput
): Promise<ApprehensionResponse> {
  const { data } = await api.post("/apprehensions", input);
  return data;
}

export async function bulkImportApprehensions(
  records: ApprehensionInput[]
): Promise<BulkImportResponse> {
  const { data } = await api.post("/apprehensions/bulk", { records });
  return data;
}

export async function updateApprehension(
  id: string,
  input: Partial<ApprehensionInput>
): Promise<ApprehensionResponse> {
  const { data } = await api.patch(`/apprehensions/${id}`, input);
  return data;
}

export async function deleteApprehension(id: string): Promise<void> {
  await api.delete(`/apprehensions/${id}`);
}

// Analytics API
export async function getTrends(
  filters: TrendsFilters = {}
): Promise<TrendsResponse> {
  const params = new URLSearchParams();

  if (filters.granularity) params.append("granularity", filters.granularity);
  if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.append("dateTo", filters.dateTo);
  if (filters.agency) params.append("agency", filters.agency);
  if (filters.violation) params.append("violation", filters.violation);
  if (filters.placeOfApprehension)
    params.append("placeOfApprehension", filters.placeOfApprehension);

  const { data } = await api.get(`/analytics/trends?${params.toString()}`);
  return data;
}

export async function getDistributions(
  filters: DistributionsFilters = {}
): Promise<DistributionsResponse> {
  const params = new URLSearchParams();

  if (filters.groupBy) params.append("groupBy", filters.groupBy);
  if (filters.limit) params.append("limit", String(filters.limit));
  if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.append("dateTo", filters.dateTo);
  if (filters.agency) params.append("agency", filters.agency);
  if (filters.violation) params.append("violation", filters.violation);
  if (filters.placeOfApprehension)
    params.append("placeOfApprehension", filters.placeOfApprehension);

  const { data } = await api.get(
    `/analytics/distributions?${params.toString()}`
  );
  return data;
}

export async function getTimePatterns(
  filters: TimePatternsFilters = {}
): Promise<TimePatternsResponse> {
  const params = new URLSearchParams();

  if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.append("dateTo", filters.dateTo);
  if (filters.agency) params.append("agency", filters.agency);
  if (filters.violation) params.append("violation", filters.violation);
  if (filters.placeOfApprehension)
    params.append("placeOfApprehension", filters.placeOfApprehension);

  const { data } = await api.get(
    `/analytics/time-patterns?${params.toString()}`
  );
  return data;
}

export async function getSummary(
  filters: SummaryFilters = {}
): Promise<SummaryResponse> {
  const params = new URLSearchParams();

  if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.append("dateTo", filters.dateTo);
  if (filters.comparePrevious)
    params.append("comparePrevious", String(filters.comparePrevious));
  if (filters.placeOfApprehension)
    params.append("placeOfApprehension", filters.placeOfApprehension);

  const { data } = await api.get(`/analytics/summary?${params.toString()}`);
  return data;
}

// Users API (Admin only)
export async function getUsers(
  filters: UserFilters = {}
): Promise<UsersResponse> {
  const params = new URLSearchParams();

  if (filters.page) params.append("page", String(filters.page));
  if (filters.limit) params.append("limit", String(filters.limit));

  const { data } = await api.get(`/users?${params.toString()}`);
  return data;
}

export async function getUser(id: string): Promise<UserResponse> {
  const { data } = await api.get(`/users/${id}`);
  return data;
}

export async function createUser(input: CreateUserInput): Promise<UserResponse> {
  const { data } = await api.post("/users", input);
  return data;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput
): Promise<UserResponse> {
  const { data } = await api.patch(`/users/${id}`, input);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}
