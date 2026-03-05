import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema";

const BASE_URL = "http://localhost:3000";

/**
 * Middleware that injects the JWT Bearer token into every request.
 * Reads the token from localStorage under the key "auth_token".
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = localStorage.getItem("auth_token");
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
};

/**
 * Type-safe API client generated from the Gateway OpenAPI spec.
 *
 * Usage:
 * ```ts
 * const { data, error } = await api.POST("/auth/login", {
 *   body: { email: "admin@example.com", password: "123456" },
 * });
 * ```
 */
const api = createClient<paths>({ baseUrl: BASE_URL });
api.use(authMiddleware);

export default api;

/**
 * Store the JWT token for subsequent API requests.
 */
export function setAuthToken(token: string): void {
  localStorage.setItem("auth_token", token);
}

/**
 * Remove the JWT token (logout).
 */
export function clearAuthToken(): void {
  localStorage.removeItem("auth_token");
}

/**
 * Get the currently stored auth token, if any.
 */
export function getAuthToken(): string | null {
  return localStorage.getItem("auth_token");
}
