import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  passkeyCount?: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  ownerId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PlatformState {
  user: AuthUser | null;
  isAuthLoading: boolean;
  token: string | null;
  currentProject: Project | null;
  isProjectManagerOpen: boolean;
  isPlatformDashboardOpen: boolean;
}

interface PlatformActions {
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  loginWithPasskey: (identifier?: string) => Promise<void>;
  registerPasskey: (deviceName?: string) => Promise<void>;
  logout: () => void;
  setCurrentProject: (project: Project | null) => void;
  openProjectManager: () => void;
  closeProjectManager: () => void;
  openPlatformDashboard: () => void;
  closePlatformDashboard: () => void;
}

const PlatformContext = createContext<(PlatformState & PlatformActions) | null>(null);

const TOKEN_KEY = "cloudide_token";

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [isPlatformDashboardOpen, setIsPlatformDashboardOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (res.ok) {
          setUser(await res.json());
        } else {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); });
  }, [token]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function saveSession(data: { token: string; user: AuthUser }) {
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function safeJson(res: Response) {
    const text = await res.text();
    if (!text) throw new Error("Server returned empty response");
    try { return JSON.parse(text); } catch { throw new Error(text); }
  }

  // ── Password auth ────────────────────────────────────────────────────────────

  const login = useCallback(async (identifier: string, password: string) => {
    setIsAuthLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, password }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Login failed");
      saveSession(data);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    setIsAuthLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Registration failed");
      saveSession(data);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  // ── Passkey auth ─────────────────────────────────────────────────────────────

  const loginWithPasskey = useCallback(async (identifier?: string) => {
    setIsAuthLoading(true);
    try {
      // 1. Get challenge from server
      const startRes = await fetch("/api/auth/passkey/login-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identifier ? { email: identifier } : {}),
      });
      const startData = await safeJson(startRes);
      if (!startRes.ok) throw new Error(startData.error || "Failed to start passkey login");

      const { challengeKey, ...options } = startData;

      // 2. Browser prompts for passkey
      const assertion = await startAuthentication({ optionsJSON: options });

      // 3. Send assertion to server
      const finishRes = await fetch("/api/auth/passkey/login-finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...assertion, challengeKey }),
      });
      const finishData = await safeJson(finishRes);
      if (!finishRes.ok) throw new Error(finishData.error || "Passkey login failed");

      saveSession(finishData);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const registerPasskey = useCallback(async (deviceName = "My Passkey") => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) throw new Error("Sign in first to add a passkey");

    setIsAuthLoading(true);
    try {
      // 1. Get registration options
      const startRes = await fetch("/api/auth/passkey/register-start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${storedToken}` },
        body: JSON.stringify({}),
      });
      const options = await safeJson(startRes);
      if (!startRes.ok) throw new Error(options.error || "Failed to start passkey registration");

      // 2. Browser creates credential
      const attResp = await startRegistration({ optionsJSON: options });

      // 3. Verify with server
      const finishRes = await fetch("/api/auth/passkey/register-finish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${storedToken}` },
        body: JSON.stringify({ ...attResp, deviceName }),
      });
      const finishData = await safeJson(finishRes);
      if (!finishRes.ok) throw new Error(finishData.error || "Passkey registration failed");

      // Refresh user to update passkeyCount
      const meRes = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${storedToken}` } });
      if (meRes.ok) setUser(await meRes.json());
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  // ── Misc ─────────────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setCurrentProjectState(null);
  }, []);

  const setCurrentProject = useCallback((project: Project | null) => setCurrentProjectState(project), []);
  const openProjectManager = useCallback(() => setIsProjectManagerOpen(true), []);
  const closeProjectManager = useCallback(() => setIsProjectManagerOpen(false), []);
  const openPlatformDashboard = useCallback(() => setIsPlatformDashboardOpen(true), []);
  const closePlatformDashboard = useCallback(() => setIsPlatformDashboardOpen(false), []);

  return (
    <PlatformContext.Provider value={{
      user, isAuthLoading, token, currentProject,
      isProjectManagerOpen, isPlatformDashboardOpen,
      login, register, loginWithPasskey, registerPasskey,
      logout, setCurrentProject,
      openProjectManager, closeProjectManager,
      openPlatformDashboard, closePlatformDashboard,
    }}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatform must be used within PlatformProvider");
  return ctx;
}
