const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

if (!API_BASE_URL) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
}

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
