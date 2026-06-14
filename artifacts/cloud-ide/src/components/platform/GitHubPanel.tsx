import React, { useState, useEffect, useCallback } from "react";
import { usePlatform } from "../../hooks/use-platform";
import {
  Github, RefreshCw, GitBranch, GitCommit, GitPullRequest,
  Upload, Download, Link, Unlink, Search, Star, Lock,
  Globe, ChevronRight, Check, X, AlertCircle, Loader2,
  FolderGit2, Clock, ArrowUp, ArrowDown, Plus,
} from "lucide-react";
import { Button } from "../ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GHRepo {
  fullName: string; name: string; private: boolean;
  description: string | null; language: string | null;
  stars: number; updatedAt: string; defaultBranch: string;
  htmlUrl: string; cloneUrl: string;
}

interface ClonedRepo { name: string; path: string; branch: string; remote: string }

interface WorkspaceStatus {
  branch: string;
  files: { status: string; file: string }[];
  remoteUrl: string;
  ahead: number;
  behind: number;
}

interface Commit { hash: string; author: string; date: string; message: string }

type Panel = "connect" | "repos" | "workspace" | "history";

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f7df1e", Python: "#3572A5",
  Rust: "#dea584", Go: "#00ADD8", Java: "#b07219", Ruby: "#701516",
  CSS: "#563d7c", HTML: "#e34c26", Shell: "#89e051", Vue: "#41b883",
  Swift: "#F05138", Kotlin: "#A97BFF",
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function api<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    M: "text-yellow-400", A: "text-green-400", D: "text-red-400",
    "?": "text-zinc-400", R: "text-blue-400", "??": "text-zinc-400",
  };
  const labels: Record<string, string> = {
    M: "Modified", A: "Added", D: "Deleted", "?": "Untracked", "??": "Untracked", R: "Renamed",
  };
  const s = status.trim().slice(0, 2);
  const key = s.replace(/\s/g, "?");
  return (
    <span className={`text-[10px] font-mono font-bold ${colors[key[0]] ?? "text-zinc-400"}`} title={labels[key[0]] ?? status}>
      {s}
    </span>
  );
}

function RelTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const label = days > 0 ? `${days}d ago` : hrs > 0 ? `${hrs}h ago` : mins > 0 ? `${mins}m ago` : "just now";
  return <span className="text-zinc-500 text-[11px]">{label}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function GitHubPanel() {
  const { token } = usePlatform();

  const [panel, setPanel] = useState<Panel>("connect");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Connection
  const [connected, setConnected] = useState(false);
  const [ghLogin, setGhLogin] = useState("");
  const [ghAvatar, setGhAvatar] = useState("");

  // Repos
  const [repos, setRepos] = useState<GHRepo[]>([]);
  const [repoSearch, setRepoSearch] = useState("");
  const [repoPage, setRepoPage] = useState(1);
  const [importing, setImporting] = useState<string | null>(null);

  // Cloned repos
  const [cloned, setCloned] = useState<ClonedRepo[]>([]);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);

  // Workspace
  const [wsStatus, setWsStatus] = useState<WorkspaceStatus | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [newBranch, setNewBranch] = useState("");
  const [showNewBranch, setShowNewBranch] = useState(false);

  // History
  const [commits, setCommits] = useState<Commit[]>([]);

  const flash = (msg: string, type: "ok" | "err" = "ok") => {
    if (type === "ok") { setSuccess(msg); setError(null); }
    else { setError(msg); setSuccess(null); }
    setTimeout(() => { setSuccess(null); setError(null); }, 4000);
  };

  // ── Check connection on mount ──────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    api<{ connected: boolean; login?: string; avatarUrl?: string }>(
      "GET", "/github/status", token
    ).then(d => {
      setConnected(d.connected);
      if (d.login) { setGhLogin(d.login); setGhAvatar(d.avatarUrl ?? ""); }
      if (d.connected) setPanel("repos");
    }).catch(() => {});
  }, [token]);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const conn = p.get("github_connected");
    const err = p.get("github_error");
    if (conn) {
      setConnected(true); setGhLogin(conn); setPanel("repos");
      flash(`Connected as ${conn}`);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (err) {
      flash(`GitHub error: ${err}`, "err");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // ── Connect ────────────────────────────────────────────────────────────────

  const connectGitHub = () => {
    if (!token) return;
    const url = `/api/github/oauth/start?token=${encodeURIComponent(token)}`;
    window.location.href = url;
  };

  const disconnect = async () => {
    if (!token) return;
    await api("DELETE", "/github/disconnect", token);
    setConnected(false); setGhLogin(""); setGhAvatar("");
    setRepos([]); setCloned([]); setPanel("connect");
    flash("Disconnected from GitHub");
  };

  // ── Repos ──────────────────────────────────────────────────────────────────

  const loadRepos = useCallback(async (q = repoSearch, page = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const d = await api<{ repos: GHRepo[] }>(
        "GET", `/github/repos?q=${encodeURIComponent(q)}&page=${page}&per_page=30`, token
      );
      setRepos(d.repos); setRepoPage(page);
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Failed to load repos", "err");
    } finally { setLoading(false); }
  }, [token, repoSearch]);

  useEffect(() => {
    if (connected && panel === "repos") loadRepos();
  }, [connected, panel]); // eslint-disable-line

  const loadCloned = useCallback(async () => {
    if (!token) return;
    const d = await api<{ repos: ClonedRepo[] }>("GET", "/github/cloned", token).catch(() => ({ repos: [] }));
    setCloned(d.repos);
    if (d.repos.length > 0 && !activeRepo) setActiveRepo(d.repos[0].path);
  }, [token, activeRepo]);

  useEffect(() => {
    if (connected) loadCloned();
  }, [connected]); // eslint-disable-line

  const importRepo = async (repo: GHRepo) => {
    if (!token) return;
    setImporting(repo.fullName);
    try {
      const d = await api<{ ok: boolean; path: string }>(
        "POST", "/github/import", token,
        { owner: repo.fullName.split("/")[0], repo: repo.name }
      );
      flash(`Imported to ${d.path}`);
      await loadCloned();
      setActiveRepo(d.path);
      setPanel("workspace");
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Import failed", "err");
    } finally { setImporting(null); }
  };

  // ── Workspace ──────────────────────────────────────────────────────────────

  const loadStatus = useCallback(async (repoPath = activeRepo) => {
    if (!token || !repoPath) return;
    try {
      const d = await api<WorkspaceStatus>("GET", `/github/workspace/status?repoPath=${encodeURIComponent(repoPath)}`, token);
      setWsStatus(d);
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Status failed", "err");
    }
  }, [token, activeRepo]);

  const loadBranches = useCallback(async (repoPath = activeRepo) => {
    if (!token || !repoPath) return;
    const d = await api<{ branches: string[] }>("GET", `/github/workspace/branches?repoPath=${encodeURIComponent(repoPath)}`, token).catch(() => ({ branches: [] }));
    setBranches(d.branches);
  }, [token, activeRepo]);

  useEffect(() => {
    if (panel === "workspace" && activeRepo) { loadStatus(); loadBranches(); }
  }, [panel, activeRepo]); // eslint-disable-line

  const commit = async () => {
    if (!token || !activeRepo || !commitMsg.trim()) return;
    setLoading(true);
    try {
      const d = await api<{ ok: boolean; committed: boolean; message?: string; output?: string }>(
        "POST", "/github/workspace/commit", token, { repoPath: activeRepo, message: commitMsg }
      );
      flash(d.committed ? "Committed successfully" : (d.message ?? "Nothing to commit"));
      setCommitMsg("");
      await loadStatus();
    } catch (e: unknown) { flash(e instanceof Error ? e.message : "Commit failed", "err"); }
    finally { setLoading(false); }
  };

  const push = async () => {
    if (!token || !activeRepo) return;
    setLoading(true);
    try {
      await api("POST", "/github/workspace/push", token, { repoPath: activeRepo });
      flash("Pushed to remote");
      await loadStatus();
    } catch (e: unknown) { flash(e instanceof Error ? e.message : "Push failed", "err"); }
    finally { setLoading(false); }
  };

  const pull = async () => {
    if (!token || !activeRepo) return;
    setLoading(true);
    try {
      const d = await api<{ ok: boolean; output: string }>("POST", "/github/workspace/pull", token, { repoPath: activeRepo });
      flash(d.output.includes("Already") ? "Already up to date" : "Pulled latest changes");
      await loadStatus();
    } catch (e: unknown) { flash(e instanceof Error ? e.message : "Pull failed", "err"); }
    finally { setLoading(false); }
  };

  const switchBranch = async (branch: string, create = false) => {
    if (!token || !activeRepo) return;
    try {
      await api("POST", "/github/workspace/branch", token, { repoPath: activeRepo, branch, create });
      flash(`Switched to ${branch}`);
      setShowNewBranch(false); setNewBranch("");
      await loadStatus(); await loadBranches();
    } catch (e: unknown) { flash(e instanceof Error ? e.message : "Branch switch failed", "err"); }
  };

  // ── History ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (panel === "history" && activeRepo && token) {
      api<{ commits: Commit[] }>("GET", `/github/workspace/log?repoPath=${encodeURIComponent(activeRepo)}&limit=30`, token)
        .then(d => setCommits(d.commits))
        .catch(() => {});
    }
  }, [panel, activeRepo, token]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const PANELS: { id: Panel; label: string; icon: React.ReactNode; requiresConnect?: boolean }[] = [
    { id: "connect",   label: "Account",   icon: <Github size={12} /> },
    { id: "repos",     label: "Repos",     icon: <FolderGit2 size={12} />, requiresConnect: true },
    { id: "workspace", label: "Workspace", icon: <GitBranch size={12} />,  requiresConnect: true },
    { id: "history",   label: "History",   icon: <GitCommit size={12} />,  requiresConnect: true },
  ];

  return (
    <div className="flex flex-col h-full text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Github size={16} className="text-zinc-300" />
          <span className="text-sm font-semibold">GitHub</span>
          {connected && (
            <span className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 text-green-400 text-[11px] px-2 py-0.5 rounded-full">
              <Check size={10} /> {ghLogin}
            </span>
          )}
        </div>
        {connected && (
          <button onClick={() => { loadCloned(); loadStatus(); }} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <RefreshCw size={13} />
          </button>
        )}
      </div>

      {/* Flash messages */}
      {(error || success) && (
        <div className={`mx-4 mt-2 px-3 py-2 rounded text-xs flex items-center gap-2
          ${error ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-green-500/10 border border-green-500/20 text-green-400"}`}>
          {error ? <AlertCircle size={12} /> : <Check size={12} />}
          {error ?? success}
        </div>
      )}

      {/* Sub-nav */}
      <div className="flex border-b border-zinc-800 px-4">
        {PANELS.map(p => (
          <button
            key={p.id}
            disabled={p.requiresConnect && !connected}
            onClick={() => setPanel(p.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors
              ${panel === p.id ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-500 hover:text-zinc-300"}
              disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── CONNECT ──────────────────────────────────────────────────────── */}
        {panel === "connect" && (
          <div className="space-y-4">
            {!connected ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
                  <Github size={32} className="text-zinc-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-200">Connect your GitHub account</p>
                  <p className="text-xs text-zinc-500 mt-1">Import repos, push changes, sync your work</p>
                </div>
                <Button onClick={connectGitHub} className="flex items-center gap-2 bg-zinc-100 text-zinc-900 hover:bg-white text-sm px-5 py-2 rounded-lg font-medium">
                  <Github size={16} /> Continue with GitHub
                </Button>
                <div className="text-[11px] text-zinc-600 text-center max-w-xs">
                  Requires <code className="bg-zinc-800 px-1 rounded">GITHUB_CLIENT_ID</code> and{" "}
                  <code className="bg-zinc-800 px-1 rounded">GITHUB_CLIENT_SECRET</code> environment variables.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  {ghAvatar && <img src={ghAvatar} alt={ghLogin} className="w-10 h-10 rounded-full" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100">{ghLogin}</p>
                    <p className="text-xs text-zinc-500">GitHub account connected</p>
                  </div>
                  <span className="flex items-center gap-1 text-green-400 text-xs"><Check size={12} /> Active</span>
                </div>
                <button
                  onClick={disconnect}
                  className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  <Unlink size={12} /> Disconnect GitHub
                </button>

                {/* Cloned repos summary */}
                {cloned.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-zinc-400 mb-2">Imported repositories</p>
                    <div className="space-y-2">
                      {cloned.map(r => (
                        <button
                          key={r.path}
                          onClick={() => { setActiveRepo(r.path); setPanel("workspace"); }}
                          className={`w-full flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors
                            ${activeRepo === r.path ? "border-blue-500/40 bg-blue-500/5" : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600"}`}
                        >
                          <FolderGit2 size={13} className="text-zinc-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-zinc-200 truncate">{r.name}</p>
                            <p className="text-[11px] text-zinc-500 truncate">{r.path}</p>
                          </div>
                          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                            <GitBranch size={10} /> {r.branch}
                          </span>
                          <ChevronRight size={12} className="text-zinc-600" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── REPOS ────────────────────────────────────────────────────────── */}
        {panel === "repos" && (
          <div className="space-y-3">
            {/* Search */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search repositories…"
                  value={repoSearch}
                  onChange={e => setRepoSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && loadRepos(repoSearch, 1)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <Button onClick={() => loadRepos(repoSearch, 1)} disabled={loading} className="bg-zinc-700 hover:bg-zinc-600 text-xs px-3 py-1.5 rounded-lg">
                {loading ? <Loader2 size={12} className="animate-spin" /> : "Search"}
              </Button>
            </div>

            {/* Repo list */}
            {loading && repos.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-zinc-500">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading…
              </div>
            ) : (
              <div className="space-y-2">
                {repos.map(repo => {
                  const isCloned = cloned.some(c => c.remote.includes(repo.name));
                  const isImporting = importing === repo.fullName;
                  return (
                    <div key={repo.fullName} className="flex items-start gap-3 p-3 bg-zinc-800/40 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {repo.private ? <Lock size={11} className="text-zinc-500" /> : <Globe size={11} className="text-zinc-500" />}
                          <span className="text-xs font-medium text-zinc-100 truncate">{repo.name}</span>
                          {repo.language && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-400 ml-auto shrink-0"
                              style={{ borderLeft: `2px solid ${LANG_COLORS[repo.language] ?? "#666"}` }}>
                              {repo.language}
                            </span>
                          )}
                        </div>
                        {repo.description && <p className="text-[11px] text-zinc-500 truncate mb-1">{repo.description}</p>}
                        <div className="flex items-center gap-3 text-[11px] text-zinc-600">
                          <span className="flex items-center gap-0.5"><Star size={9} /> {repo.stars}</span>
                          <span className="flex items-center gap-0.5"><GitBranch size={9} /> {repo.defaultBranch}</span>
                          <RelTime iso={repo.updatedAt} />
                        </div>
                      </div>
                      <button
                        onClick={() => importRepo(repo)}
                        disabled={isCloned || isImporting}
                        className={`shrink-0 flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md font-medium transition-colors
                          ${isCloned ? "bg-green-500/10 text-green-400 border border-green-500/20 cursor-default"
                            : "bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20"}`}
                      >
                        {isImporting ? <Loader2 size={11} className="animate-spin" /> : isCloned ? <Check size={11} /> : <Download size={11} />}
                        {isCloned ? "Imported" : "Import"}
                      </button>
                    </div>
                  );
                })}
                {repos.length === 0 && !loading && (
                  <p className="text-center text-xs text-zinc-600 py-6">No repositories found</p>
                )}
              </div>
            )}

            {/* Pagination */}
            {repos.length === 30 && (
              <div className="flex items-center justify-between pt-1">
                <button onClick={() => loadRepos(repoSearch, Math.max(1, repoPage - 1))} disabled={repoPage === 1}
                  className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30">← Prev</button>
                <span className="text-xs text-zinc-600">Page {repoPage}</span>
                <button onClick={() => loadRepos(repoSearch, repoPage + 1)} className="text-xs text-zinc-500 hover:text-zinc-300">Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ── WORKSPACE ────────────────────────────────────────────────────── */}
        {panel === "workspace" && (
          <div className="space-y-4">
            {/* Repo selector */}
            {cloned.length > 1 && (
              <select
                value={activeRepo ?? ""}
                onChange={e => { setActiveRepo(e.target.value); setWsStatus(null); }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
              >
                {cloned.map(r => <option key={r.path} value={r.path}>{r.name}</option>)}
              </select>
            )}

            {!activeRepo ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                No imported repository. Go to Repos to import one.
              </div>
            ) : wsStatus === null ? (
              <div className="flex items-center justify-center py-8 text-zinc-500">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading status…
              </div>
            ) : (
              <>
                {/* Branch + sync state */}
                <div className="flex items-center justify-between p-3 bg-zinc-800/40 border border-zinc-700 rounded-lg">
                  <div className="flex items-center gap-2">
                    <GitBranch size={14} className="text-blue-400" />
                    <span className="text-sm font-medium text-zinc-100">{wsStatus.branch}</span>
                    {wsStatus.ahead > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-green-400">
                        <ArrowUp size={10} /> {wsStatus.ahead}
                      </span>
                    )}
                    {wsStatus.behind > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-yellow-400">
                        <ArrowDown size={10} /> {wsStatus.behind}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={pull} disabled={loading} title="Pull"
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors disabled:opacity-50">
                      {loading ? <Loader2 size={11} className="animate-spin" /> : <GitPullRequest size={11} />} Pull
                    </button>
                    <button onClick={push} disabled={loading || wsStatus.ahead === 0} title="Push"
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50">
                      {loading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Push
                    </button>
                    <button onClick={() => loadStatus()} title="Refresh"
                      className="text-zinc-500 hover:text-zinc-300 transition-colors p-1">
                      <RefreshCw size={12} />
                    </button>
                  </div>
                </div>

                {/* Branch switcher */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-400">Branches</span>
                    <button onClick={() => setShowNewBranch(v => !v)}
                      className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                      <Plus size={11} /> New branch
                    </button>
                  </div>
                  {showNewBranch && (
                    <div className="flex gap-2">
                      <input value={newBranch} onChange={e => setNewBranch(e.target.value)}
                        placeholder="branch-name"
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                        onKeyDown={e => e.key === "Enter" && newBranch && switchBranch(newBranch, true)}
                      />
                      <button onClick={() => newBranch && switchBranch(newBranch, true)}
                        className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
                        Create
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {branches.map(b => (
                      <button key={b} onClick={() => switchBranch(b)}
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors
                          ${b === wsStatus.branch ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"}`}>
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Changed files */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-400">
                      Changes {wsStatus.files.length > 0 && <span className="ml-1 bg-zinc-700 text-zinc-300 text-[10px] px-1.5 rounded-full">{wsStatus.files.length}</span>}
                    </span>
                  </div>
                  {wsStatus.files.length === 0 ? (
                    <p className="text-[11px] text-zinc-600 py-2">Working tree clean</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {wsStatus.files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-zinc-800/40">
                          <StatusBadge status={f.status} />
                          <span className="text-[11px] text-zinc-300 font-mono truncate flex-1">{f.file}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Commit */}
                <div className="space-y-2">
                  <span className="text-xs font-medium text-zinc-400">Commit message</span>
                  <textarea
                    value={commitMsg}
                    onChange={e => setCommitMsg(e.target.value)}
                    placeholder="Describe your changes…"
                    rows={3}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none"
                  />
                  <button
                    onClick={commit}
                    disabled={loading || !commitMsg.trim() || wsStatus.files.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
                  >
                    {loading ? <Loader2 size={13} className="animate-spin" /> : <GitCommit size={13} />}
                    Commit all changes
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── HISTORY ──────────────────────────────────────────────────────── */}
        {panel === "history" && (
          <div className="space-y-2">
            {!activeRepo ? (
              <p className="text-center text-xs text-zinc-600 py-8">No imported repository selected.</p>
            ) : commits.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-zinc-500">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading commits…
              </div>
            ) : (
              commits.map((c, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-zinc-800/60 last:border-0">
                  <div className="mt-0.5 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                    <GitCommit size={12} className="text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-200 leading-snug">{c.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-zinc-500">{c.author}</span>
                      <span className="text-zinc-700">·</span>
                      <span className="font-mono text-[11px] text-zinc-600">{c.hash}</span>
                      <span className="text-zinc-700">·</span>
                      <RelTime iso={c.date} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}
