import React, { useState, useEffect } from "react";
import { CONFIG } from "../config";
import { services } from "../services";

/**
 * Auth context — holds the currently logged-in user and token.
 *
 * Provides login(), signup(), logout() helpers that wrap the corresponding
 * service calls and notify `services` of the active token so subsequent
 * requests carry it (via the module-level _authToken in services.js).
 *
 * Persistence is attempted via localStorage but wrapped in try/catch so it
 * degrades gracefully where storage isn't available (e.g. some sandboxed
 * preview environments). In production the try/catch can be removed.
 */
export const AuthContext = React.createContext(null);

export function AuthProvider({ children }) {
  /** @type {[import("../services").User|null, Function]} */
  const [user, setUser] = useState(null);
  /** @type {[string|null, Function]} */
  const [token, setToken] = useState(null);

  // Restore from localStorage on first mount
  useEffect(() => {
    try {
      const raw = window.localStorage?.getItem(CONFIG.AUTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.token && parsed?.user) {
        setUser(parsed.user);
        setToken(parsed.token);
        services.setAuthToken(parsed.token);
      }
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, []);

  const persist = (u, t) => {
    try {
      window.localStorage?.setItem(
        CONFIG.AUTH_STORAGE_KEY,
        JSON.stringify({ user: u, token: t })
      );
    } catch {
      /* ignore */
    }
  };
  const clearPersist = () => {
    try {
      window.localStorage?.removeItem(CONFIG.AUTH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const login = async (email, password) => {
    const result = await services.login(email, password);
    setUser(result.user);
    setToken(result.token);
    persist(result.user, result.token);
    return result;
  };

  const signup = async (profile) => {
    const result = await services.signup(profile);
    setUser(result.user);
    setToken(result.token);
    persist(result.user, result.token);
    return result;
  };

  const logout = async () => {
    try {
      await services.logout();
    } catch {
      /* ignore network failure on logout */
    }
    setUser(null);
    setToken(null);
    clearPersist();
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, signup, logout, isAuthed: !!token }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Hook for any component inside AuthProvider to read auth state and actions. */
export const useAuth = () => {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
