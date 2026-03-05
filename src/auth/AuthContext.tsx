import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  type AuthUser,
  getStoredUser,
  isTokenValid,
  login as authLogin,
  logout as authLogout,
  msUntilTokenExpiry,
} from "./authService";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(() => {
    // Rehydrate from localStorage if the token is still valid
    if (isTokenValid()) return getStoredUser();
    return null;
  });
  const [sessionExpired, setSessionExpired] = useState(false);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Schedule a redirect to /login when the token expires.
   */
  const scheduleExpiryRedirect = useCallback(() => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);

    const ms = msUntilTokenExpiry();
    if (ms <= 0) return;

    expiryTimerRef.current = setTimeout(() => {
      authLogout();
      setUser(null);
      setSessionExpired(true);
      navigate("/login", { replace: true });
    }, ms);
  }, [navigate]);

  // On mount: if the stored token is already expired, clear it immediately
  useEffect(() => {
    if (!isTokenValid() && getStoredUser()) {
      authLogout();
      setUser(null);
      setSessionExpired(true);
    }
  }, []);

  // Start the expiry timer whenever we have a logged-in user
  useEffect(() => {
    if (user) {
      scheduleExpiryRedirect();
    }
    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, [user, scheduleExpiryRedirect]);

  const login = useCallback(
    async (email: string, password: string) => {
      const loggedInUser = await authLogin(email, password);

      setUser(loggedInUser);
      setSessionExpired(false);

      scheduleExpiryRedirect();

      navigate("/", { replace: true });
    },
    [navigate, scheduleExpiryRedirect],
  );

  const logout = useCallback(() => {
    authLogout();

    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);

    setUser(null);
    setSessionExpired(false);

    navigate("/login", { replace: true });
  }, [navigate]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, sessionExpired, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to consume AuthContext. Must be used inside <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
