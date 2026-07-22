import type {
  AuthSession,
  AuthUser,
  LocationCandidate,
  PoiCandidate,
  RoutePlan,
  SharedTripResponse,
  ShareTripResponse,
  SystemStatus,
  TripRecord,
  TripSummary,
} from "./types";
import { getAuthToken, setAuthSession } from "./auth";
import { getClientId } from "./client-id";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/backend";
const DEFAULT_TIMEOUT_MS = 18000;
const HISTORY_LIMIT = 12;

type RequestOptions = {
  retries?: number;
  timeoutMs?: number;
};

class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const retries = options.retries ?? 0;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: withClientHeaders(path, init.headers),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ApiError(await responseErrorMessage(response), response.status);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) {
        throw normalizeRequestError(error);
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw normalizeRequestError(lastError);
}

function withClientHeaders(path: string, headers: HeadersInit | undefined): Headers {
  const nextHeaders = new Headers(headers);
  if (needsIdentity(path)) {
    nextHeaders.set("X-Client-Id", getClientId());
    const token = getAuthToken();
    if (token) {
      nextHeaders.set("Authorization", `Bearer ${token}`);
    }
  }
  return nextHeaders;
}

function needsIdentity(path: string): boolean {
  return path.startsWith("/api/trips") || path.startsWith("/api/route-plans") || path.startsWith("/api/auth");
}

async function postJson<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
}

async function getJson<T>(path: string, options?: RequestOptions): Promise<T> {
  return requestJson<T>(path, {}, options);
}

async function deleteJson<T>(path: string, options?: RequestOptions): Promise<T> {
  return requestJson<T>(path, { method: "DELETE" }, options);
}

async function responseErrorMessage(response: Response): Promise<string> {
  const rawText = await response.text();
  const detail = parseErrorDetail(rawText);
  if (detail) {
    return detail;
  }
  if (response.status === 404) {
    return "没有找到对应的数据，请刷新后重试。";
  }
  if (response.status === 429) {
    return "请求太频繁了，请稍等一下再试。";
  }
  if (response.status >= 500) {
    return "服务暂时不可用，请稍后重试。";
  }
  return rawText || `请求失败，状态码 ${response.status}`;
}

function parseErrorDetail(rawText: string): string {
  if (!rawText) {
    return "";
  }
  try {
    const data = JSON.parse(rawText) as { detail?: unknown };
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      return "输入信息有误，请检查城市、起点、时间和目的地。";
    }
  } catch {
    return rawText;
  }
  return rawText;
}

function shouldRetry(error: unknown) {
  if (error instanceof ApiError) {
    return error.status === 408 || error.status === 429 || (typeof error.status === "number" && error.status >= 500);
  }
  return error instanceof DOMException || error instanceof TypeError;
}

function normalizeRequestError(error: unknown): Error {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error("请求超时了，请检查网络或稍后重试。");
  }
  if (error instanceof TypeError) {
    return new Error("无法连接到服务，请确认本地服务已启动，或稍后重试。");
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("请求失败，请稍后重试。");
}

export async function searchPoi(city: string, keyword: string): Promise<PoiCandidate[]> {
  const data = await postJson<{ candidates: PoiCandidate[] }>(
    "/api/poi/search",
    {
      city,
      keyword,
    },
    { retries: 1, timeoutMs: 12000 },
  );
  return data.candidates;
}

export async function resolveLocation(city: string, keyword: string): Promise<LocationCandidate | null> {
  const data = await postJson<{ location: LocationCandidate | null }>(
    "/api/poi/geocode",
    {
      city,
      keyword,
    },
    { retries: 1, timeoutMs: 12000 },
  );
  return data.location;
}

export async function reverseGeocodeLocation(lat: number, lng: number): Promise<LocationCandidate | null> {
  const data = await postJson<{ location: LocationCandidate | null }>(
    "/api/poi/reverse-geocode",
    {
      lat,
      lng,
    },
    { retries: 1, timeoutMs: 12000 },
  );
  return data.location;
}

export async function createTrip(payload: unknown): Promise<{ tripId: number; status: string }> {
  return postJson("/api/trips", payload);
}

export async function generateRoutes(tripId: number, options?: { fixedOrder?: boolean }): Promise<RoutePlan[]> {
  const data = await postJson<{ plans: RoutePlan[] }>(
    `/api/trips/${tripId}/routes`,
    {
      fixedOrder: options?.fixedOrder ?? false,
    },
    { timeoutMs: 60000 },
  );
  return data.plans;
}

export async function getTripHistory(): Promise<{ trips: TripSummary[]; total: number }> {
  const data = await getJson<{ trips: TripSummary[]; total?: number }>(`/api/trips?limit=${HISTORY_LIMIT}`, {
    retries: 1,
  });
  return {
    trips: data.trips,
    total: data.total ?? data.trips.length,
  };
}

export async function getTrip(tripId: number): Promise<TripRecord> {
  return getJson<TripRecord>(`/api/trips/${tripId}`, { retries: 1 });
}

export async function getSavedRoutes(tripId: number): Promise<RoutePlan[]> {
  const data = await getJson<{ plans: RoutePlan[] }>(`/api/trips/${tripId}/routes`, { retries: 1 });
  return data.plans;
}

export async function createTripShare(tripId: number): Promise<ShareTripResponse> {
  return postJson<ShareTripResponse>(`/api/trips/${tripId}/share`, {});
}

export async function getSharedTrip(shareToken: string): Promise<SharedTripResponse> {
  return getJson<SharedTripResponse>(`/api/shared-trips/${encodeURIComponent(shareToken)}`, { retries: 1 });
}

export async function deleteTrip(tripId: number): Promise<void> {
  await deleteJson<{ status: string }>(`/api/trips/${tripId}`);
}

export async function registerAccount(email: string, password: string): Promise<AuthSession> {
  const session = await postJson<AuthSession>("/api/auth/register", { email, password });
  setAuthSession(session);
  return session;
}

export async function loginAccount(email: string, password: string): Promise<AuthSession> {
  const session = await postJson<AuthSession>("/api/auth/login", { email, password });
  setAuthSession(session);
  return session;
}

export async function getCurrentAccount(): Promise<AuthUser> {
  return getJson<AuthUser>("/api/auth/me", { retries: 1, timeoutMs: 8000 });
}

export async function getBackendHealth(): Promise<{ status: string }> {
  return getJson<{ status: string }>("/health", { retries: 1, timeoutMs: 8000 });
}

export async function getSystemStatus(): Promise<SystemStatus> {
  return getJson<SystemStatus>("/api/system/status", { retries: 1, timeoutMs: 8000 });
}
