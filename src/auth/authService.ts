import api, { setAuthToken, clearAuthToken, getAuthToken } from "../api/client";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const USER_KEY = "auth_user";

/**
 * Parse a JWT payload without verifying the signature.
 * Used client-side only for reading expiry and claims.
 */
function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Returns true if the stored JWT is present and not yet expired.
 */
export function isTokenValid(): boolean {
  const token = getAuthToken();
  if (!token) return false;

  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;

  // exp is in seconds; Date.now() is in ms
  return payload.exp * 1000 > Date.now();
}

/**
 * Returns milliseconds until the stored token expires (or 0 if already expired).
 */
export function msUntilTokenExpiry(): number {
  const token = getAuthToken();
  if (!token) return 0;

  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return 0;

  return Math.max(0, payload.exp * 1000 - Date.now());
}

/**
 * Persist the authenticated user profile to localStorage.
 */
function saveUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Retrieve the currently logged-in user from localStorage, or null.
 */
export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

/**
 * Attempt to log in with email + password.
 *
 * On success:
 *   - stores the JWT via setAuthToken()
 *   - stores user profile in localStorage
 *
 * Throws an error if:
 *   - credentials are wrong (API error)
 *   - the user is NOT an admin (role check)
 */
export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  const { data, error } = await api.POST("/auth/login", {
    body: { email, password },
  });

  console.log("Login response:", { data, error });

  if (error || !data) {
    const errMsg =
      error != null && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Invalid credentials";
    throw new Error(errMsg);
  }

  // The login response shape from the shared DTO: { access_token, user: { id, name, email, role } }
  const response = data as { accessToken: string; user: AuthUser };

  console.log("Parsed login response:", response);

  if (!response.accessToken || !response.user) {
    console.log("Login response missing accessToken or user:", response);
    throw new Error("Unexpected response from server");
  }

  if (response.user.role !== "admin") {
    throw new Error("Access denied: admin role required");
  }

  setAuthToken(response.accessToken);
  saveUser(response.user);

  return response.user;
}

/**
 * Clear all auth state (token + user profile).
 */
export function logout(): void {
  clearAuthToken();
  localStorage.removeItem(USER_KEY);
}
