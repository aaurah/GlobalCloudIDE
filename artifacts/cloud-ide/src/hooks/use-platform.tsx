import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
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
}

interface PlatformActions {
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setCurrentProject: (project: Project | null) => void;
  openProjectManager: () => void;
  closeProjectManager: () => void;
}

const PlatformContext = createContext<(PlatformState & PlatformActions) | null>(null);

const TOKEN_KEY = "cloudide_token";

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      });
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    setIsAuthLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Login failed");
      }
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
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
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Registration failed");
      }
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setCurrentProjectState(null);
  }, []);

  const setCurrentProject = useCallback((project: Project | null) => {
    setCurrentProjectState(project);
  }, []);

  const openProjectManager = useCallback(() => setIsProjectManagerOpen(true), []);
  const closeProjectManager = useCallback(() => setIsProjectManagerOpen(false), []);

  return (
    <PlatformContext.Provider
      value={{
        user,
        isAuthLoading,
        token,
        currentProject,
        isProjectManagerOpen,
        login,
        register,
        logout,
        setCurrentProject,
        openProjectManager,
        closeProjectManager,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatform must be used within PlatformProvider");
  return ctx;
}
