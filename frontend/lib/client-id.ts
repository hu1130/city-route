const CLIENT_ID_STORAGE_KEY = "city-route-client-id";
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{3,128}$/;

export function getClientId(): string {
  if (typeof window === "undefined") {
    return "anonymous";
  }

  try {
    const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing && CLIENT_ID_PATTERN.test(existing)) {
      return existing;
    }

    const nextClientId = buildClientId();
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, nextClientId);
    return nextClientId;
  } catch {
    return "anonymous";
  }
}

function buildClientId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return `guest_${window.crypto.randomUUID()}`;
  }
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}
