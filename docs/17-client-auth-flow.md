# 17 — Client-Side Auth Flow: Secure Token Storage, Session Management & JWT Expiration

## Overview

After a user logs in via the backend Gateway (`POST /auth/login`), a **JSON Web Token (JWT)** is returned. The desktop client is responsible for:

1. Storing that token securely
2. Injecting it into every subsequent API request
3. Detecting when it expires and redirecting to the login screen
4. Validating that the user has the `admin` role before allowing access

This document explains each piece of the implementation added in task 17.

---

## 1. What is a JWT?

A JWT has three parts separated by dots:

```
HEADER.PAYLOAD.SIGNATURE
```

The **payload** is a Base64URL-encoded JSON object that contains _claims_ — metadata about the token:

```json
{
  "sub": "d83c4801-...",
  "email": "admin@example.com",
  "role": "admin",
  "iat": 1709500000,
  "exp": 1709503600
}
```

| Claim | Meaning                        |
| ----- | ------------------------------ |
| `sub` | Subject — the user's ID        |
| `iat` | Issued At (Unix seconds)       |
| `exp` | Expiration time (Unix seconds) |

The client can **read** the payload without a secret key (it's only Base64-encoded, not encrypted). However, it **cannot forge** a token — the signature is verified server-side using `JWT_SECRET`.

---

## 2. Token Storage in an Electron App

### Why `localStorage`?

In a web app running in the browser, `localStorage` is a common choice. In Electron, every renderer process runs in a Chromium context, so `localStorage` is also available.

```ts
// Store after successful login
localStorage.setItem("auth_token", token);

// Read on every request
const token = localStorage.getItem("auth_token");

// Clear on logout
localStorage.removeItem("auth_token");
```

### Security trade-offs

| Storage                | XSS risk | Notes                                     |
| ---------------------- | -------- | ----------------------------------------- |
| `localStorage`         | Medium   | Accessible from any JS in the same origin |
| `sessionStorage`       | Medium   | Cleared on tab/window close               |
| Memory (React state)   | Low      | Lost on reload — bad UX                   |
| Electron `safeStorage` | Very low | OS-level encryption, ideal for production |

For a production admin desktop app, `safeStorage` (via the Electron main process) or `keytar` would be preferred. For this learning project, `localStorage` is sufficient and simpler.

---

## 3. Injecting the Token into Requests

Every API call must include an `Authorization: Bearer <token>` header. Instead of manually passing the token each time, we register an **openapi-fetch middleware** that intercepts every request:

```ts
// src/api/client.ts
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = localStorage.getItem("auth_token");
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
};

const api = createClient<paths>({ baseUrl: BASE_URL });
api.use(authMiddleware);
```

This mirrors the **interceptor** pattern common in Axios. All API calls through this `api` instance automatically carry the token.

---

## 4. Auth Service (`authService.ts`)

The auth service encapsulates the login logic:

```
POST /auth/login
  └─ success → store token + user → return AuthUser
  └─ role !== "admin" → throw "Access denied: admin role required"
  └─ API error → throw error message
```

### Role validation

The backend issues a token for _any_ user (including non-admins). The desktop client must validate that only admins can proceed:

```ts
if (response.user.role !== "admin") {
  throw new Error("Access denied: admin role required");
}
```

This is a **client-side guard** only. The API also enforces roles with `@Roles('admin')` on protected endpoints.

### Parsing the JWT expiry (client-side)

```ts
function parseJwtPayload(token: string): Record<string, unknown> | null {
  const base64 = token.split(".")[1]; // grab the payload segment
  const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/")); // base64url → base64 → string
  return JSON.parse(json);
}

export function isTokenValid(): boolean {
  const payload = parseJwtPayload(getAuthToken()!);
  return (payload?.exp as number) * 1000 > Date.now(); // exp is seconds, Date.now() is ms
}
```

> ⚠️ This decodes the token but **does not verify the signature**. Client-side expiry checks are only for UX (avoiding unnecessary API calls). The server always validates the signature independently.

---

## 5. Session Management with React Context (`AuthContext.tsx`)

A React Context provides a single source of truth for auth state across the entire app:

```
AuthProvider
  ├─ user: AuthUser | null
  ├─ isAuthenticated: boolean
  ├─ sessionExpired: boolean    ← shown as a warning banner on the login page
  ├─ login(email, password)     ← calls authService.login(), navigates to /
  └─ logout()                   ← clears storage, navigates to /login
```

### Rehydrating on refresh

When the app first loads, the context checks if a valid token already exists in localStorage and restores the session:

```ts
const [user, setUser] = useState<AuthUser | null>(() => {
  if (isTokenValid()) return getStoredUser(); // silent re-login
  return null; // expired → force login
});
```

This means the user doesn't have to log in again if they close and reopen the app while the token is still valid.

---

## 6. JWT Expiration Detection

When the user logs in successfully, a timer is set to fire **exactly when the token expires**:

```ts
const scheduleExpiryRedirect = useCallback(() => {
  const ms = msUntilTokenExpiry(); // (exp * 1000) - Date.now()
  if (ms <= 0) return;

  expiryTimerRef.current = setTimeout(() => {
    authLogout();
    setUser(null);
    setSessionExpired(true); // triggers "session expired" banner
    navigate("/login", { replace: true });
  }, ms);
}, [navigate]);
```

This ensures the user is redirected **automatically** the moment their session expires, without needing a polling loop.

### "Session expired" banner

When `sessionExpired` is `true`, the login page shows a warning instead of a generic prompt:

```tsx
{
  sessionExpired && (
    <div className="login-alert login-alert--warning">
      ⚠️ Your session has expired. Please sign in again.
    </div>
  );
}
```

---

## 7. Protected Routes

A `<ProtectedRoute>` component guards all authenticated pages:

```tsx
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

The router wraps the entire authenticated layout inside this guard:

```tsx
<Route
  path="/"
  element={
    <ProtectedRoute>
      <AppShell /> {/* sidebar + <Outlet /> */}
    </ProtectedRoute>
  }
>
  <Route index element={<DashboardPage />} />
  <Route path="send" element={<SendNotificationPage />} />
</Route>
```

`<Outlet />` is React Router's way of rendering the matched child route inside a layout component — similar to a slot in Vue.

---

## 8. Complete Auth Flow Diagram

```
App starts
  │
  ├─ Token in localStorage?
  │    ├─ Yes, valid → restore session → show AppShell
  │    └─ No/Expired → show LoginPage
  │
LoginPage
  │
  ├─ User submits email + password
  │    └─ POST /auth/login
  │         ├─ Error → show error alert
  │         ├─ role !== "admin" → show "Access denied" error
  │         └─ OK → store token + user → navigate("/")
  │
AppShell (protected)
  │
  ├─ Every API call automatically includes Authorization: Bearer <token>
  │
  ├─ Token expiry timer fires (exp * 1000 - Date.now() ms)
  │    └─ Clear storage → setSessionExpired(true) → navigate("/login")
  │
  └─ User clicks logout
       └─ Clear storage → navigate("/login")
```

---

## 9. Key Takeaways

| Concept             | Implementation                                                 |
| ------------------- | -------------------------------------------------------------- |
| Token storage       | `localStorage` (simple); use `safeStorage` in production       |
| Token injection     | openapi-fetch middleware                                       |
| Role guard          | Client-side check + server-side `@Roles()` decorator           |
| Expiry detection    | `setTimeout` scheduled at login time, based on JWT `exp` claim |
| Session restoration | Read from localStorage on React state init                     |
| UI feedback         | "Session expired" banner, disabled button during loading       |
| Route protection    | `<ProtectedRoute>` component wrapping the layout               |

---

## References

- [JWT Introduction](https://jwt.io/introduction)
- [NestJS JWT Auth Docs](https://docs.nestjs.com/security/authentication)
- [React Router v7 — Layout Routes](https://reactrouter.com/start/framework/routing#layout-routes)
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [openapi-fetch Middleware](https://openapi-ts.dev/openapi-fetch/middleware-auth)
