import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getAuthUser } from "./auth";

const execFileAsync = promisify(execFile);
const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPlatformDir() {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

function getWorkspaceDir() {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(root, "ide-workspace");
}

interface GitHubToken {
  userId: string;
  accessToken: string;
  login: string;
  avatarUrl: string;
  connectedAt: string;
}

async function readTokens(): Promise<GitHubToken[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(getPlatformDir(), "github-tokens.json"), "utf-8"));
  } catch { return []; }
}

async function writeTokens(d: GitHubToken[]) {
  const dir = getPlatformDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "github-tokens.json"), JSON.stringify(d, null, 2));
}

async function getToken(userId: string): Promise<GitHubToken | null> {
  const all = await readTokens();
  return all.find(t => t.userId === userId) ?? null;
}

async function ghApi(token: string, endpoint: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API ${method} ${endpoint}: ${res.status} ${err.slice(0, 200)}`);
  }
  return res.json();
}

async function git(cwd: string, args: string[], env?: Record<string, string>): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 60_000,
  });
  return stdout.trim();
}

function getCallbackUrl(req: import("express").Request): string {
  const host = process.env.REPLIT_DEV_DOMAIN
    ?? req.get("x-forwarded-host")
    ?? req.get("host")
    ?? "localhost:5000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}/api/github/oauth/callback`;
}

// ── OAuth ────────────────────────────────────────────────────────────────────

// GET /github/oauth/start  (token passed as query param — redirect flow)
router.get("/github/oauth/start", (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return void res.status(503).json({ error: "GITHUB_CLIENT_ID not configured" });

  const userToken = req.query.token as string | undefined;
  if (!userToken) return void res.status(400).json({ error: "token required" });

  const state = Buffer.from(JSON.stringify({ t: userToken })).toString("base64url");
  const callbackUrl = getCallbackUrl(req);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: "repo user read:org",
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GET /github/oauth/callback
router.get("/github/oauth/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  const frontendBase = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:5000";

  if (error) return void res.redirect(`${frontendBase}/?github_error=${encodeURIComponent(error)}`);
  if (!code || !state) return void res.redirect(`${frontendBase}/?github_error=missing_params`);

  try {
    const { t: userToken } = JSON.parse(Buffer.from(state, "base64url").toString());
    const userId = getAuthUser(userToken);
    if (!userId) return void res.redirect(`${frontendBase}/?github_error=invalid_token`);

    const clientId = process.env.GITHUB_CLIENT_ID!;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET!;
    if (!clientId || !clientSecret) return void res.redirect(`${frontendBase}/?github_error=not_configured`);

    // Exchange code for token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return void res.redirect(`${frontendBase}/?github_error=${encodeURIComponent(tokenData.error ?? "token_exchange_failed")}`);
    }

    // Get user info
    const ghUser = await ghApi(tokenData.access_token, "/user") as { login: string; avatar_url: string };

    const all = await readTokens();
    const idx = all.findIndex(t => t.userId === userId);
    const entry: GitHubToken = {
      userId,
      accessToken: tokenData.access_token,
      login: ghUser.login,
      avatarUrl: ghUser.avatar_url,
      connectedAt: new Date().toISOString(),
    };
    if (idx >= 0) all[idx] = entry; else all.push(entry);
    await writeTokens(all);

    res.redirect(`${frontendBase}/?github_connected=${encodeURIComponent(ghUser.login)}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.redirect(`${frontendBase}/?github_error=${encodeURIComponent(msg.slice(0, 100))}`);
  }
});

// ── Connection status ─────────────────────────────────────────────────────────

// GET /github/status
router.get("/github/status", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const tkn = await getToken(userId);
  if (!tkn) return void res.json({ connected: false });
  res.json({ connected: true, login: tkn.login, avatarUrl: tkn.avatarUrl, connectedAt: tkn.connectedAt });
});

// DELETE /github/disconnect
router.delete("/github/disconnect", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const all = await readTokens();
  await writeTokens(all.filter(t => t.userId !== userId));
  res.json({ ok: true });
});

// ── Repositories ──────────────────────────────────────────────────────────────

// GET /github/repos?page=1&per_page=30&q=search
router.get("/github/repos", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const tkn = await getToken(userId);
  if (!tkn) return void res.status(403).json({ error: "GitHub not connected" });

  const page = Number(req.query.page ?? 1);
  const perPage = Math.min(Number(req.query.per_page ?? 30), 100);
  const q = (req.query.q as string | undefined)?.trim();

  try {
    let repos: unknown[];
    if (q) {
      const result = await ghApi(tkn.accessToken,
        `/search/repositories?q=${encodeURIComponent(`${q} user:${tkn.login}`)}&per_page=${perPage}&page=${page}&sort=updated`
      ) as { items: unknown[] };
      repos = result.items;
    } else {
      repos = await ghApi(tkn.accessToken,
        `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator`
      ) as unknown[];
    }

    const mapped = (repos as Array<{
      full_name: string; name: string; private: boolean;
      description: string | null; language: string | null;
      stargazers_count: number; updated_at: string;
      default_branch: string; html_url: string; clone_url: string;
    }>).map(r => ({
      fullName: r.full_name,
      name: r.name,
      private: r.private,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      updatedAt: r.updated_at,
      defaultBranch: r.default_branch,
      htmlUrl: r.html_url,
      cloneUrl: r.clone_url,
    }));

    res.json({ repos: mapped, page, perPage });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to fetch repos" });
  }
});

// GET /github/repos/:owner/:repo/branches
router.get("/github/repos/:owner/:repo/branches", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const tkn = await getToken(userId);
  if (!tkn) return void res.status(403).json({ error: "GitHub not connected" });

  const { owner, repo } = req.params;
  try {
    const branches = await ghApi(tkn.accessToken, `/repos/${owner}/${repo}/branches?per_page=50`) as Array<{ name: string }>;
    res.json({ branches: branches.map(b => b.name) });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

// ── Import (clone) ────────────────────────────────────────────────────────────

// POST /github/import  { owner, repo, branch? }
router.post("/github/import", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const tkn = await getToken(userId);
  if (!tkn) return void res.status(403).json({ error: "GitHub not connected" });

  const { owner, repo, branch } = req.body as { owner: string; repo: string; branch?: string };
  if (!owner || !repo) return void res.status(400).json({ error: "owner and repo required" });

  // Prevent path traversal
  if (/[^a-zA-Z0-9_.\-]/.test(repo)) return void res.status(400).json({ error: "Invalid repo name" });

  const projectsDir = path.join(getWorkspaceDir(), "projects");
  await fs.mkdir(projectsDir, { recursive: true });

  const destName = `${owner}-${repo}`;
  const destDir = path.join(projectsDir, destName);

  // Check if already cloned
  try {
    await fs.access(path.join(destDir, ".git"));
    return void res.status(409).json({ error: "Already imported", path: `projects/${destName}` });
  } catch { /* not cloned yet */ }

  const authUrl = `https://${tkn.accessToken}@github.com/${owner}/${repo}.git`;

  try {
    const cloneArgs = ["clone", "--depth", "50", authUrl, destDir];
    if (branch) cloneArgs.splice(2, 0, "-b", branch);
    await execFileAsync("git", cloneArgs, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 120_000,
    });

    // Set user identity for commits
    await git(destDir, ["config", "user.email", `${userId}@cloudide.local`]);
    await git(destDir, ["config", "user.name", tkn.login]);

    // Store auth in local config (no plaintext in global config)
    await git(destDir, ["config", "credential.helper", "store"]);
    const authFile = path.join(destDir, ".git", "credentials");
    await fs.writeFile(authFile, `https://${tkn.accessToken}:x-oauth-basic@github.com\n`);
    await git(destDir, ["config", "credential.helper", `store --file ${authFile}`]);

    res.json({ ok: true, path: `projects/${destName}`, fullPath: destDir });
  } catch (e: unknown) {
    // Clean up failed clone
    await fs.rm(destDir, { recursive: true, force: true });
    res.status(500).json({ error: e instanceof Error ? e.message : "Clone failed" });
  }
});

// ── Workspace git operations ──────────────────────────────────────────────────

function resolveRepoPath(repoPath: string): string {
  const ws = getWorkspaceDir();
  const full = path.resolve(ws, repoPath);
  // Security: must stay inside workspace
  if (!full.startsWith(ws + path.sep) && full !== ws) throw new Error("Path outside workspace");
  return full;
}

// GET /github/workspace/status?repoPath=projects/owner-repo
router.get("/github/workspace/status", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const repoPath = (req.query.repoPath as string | undefined) ?? "";
  if (!repoPath) return void res.status(400).json({ error: "repoPath required" });

  try {
    const dir = resolveRepoPath(repoPath);
    const [branch, status, remoteUrl, aheadBehind] = await Promise.all([
      git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""),
      git(dir, ["status", "--porcelain"]).catch(() => ""),
      git(dir, ["remote", "get-url", "origin"]).catch(() => ""),
      git(dir, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]).catch(() => "0\t0"),
    ]);

    const files = status.split("\n").filter(Boolean).map(line => ({
      status: line.slice(0, 2).trim(),
      file: line.slice(3),
    }));

    const [ahead = "0", behind = "0"] = aheadBehind.split("\t");
    const safeRemote = remoteUrl.replace(/https:\/\/[^@]+@/, "https://");

    res.json({ branch, files, remoteUrl: safeRemote, ahead: Number(ahead), behind: Number(behind) });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Git status failed" });
  }
});

// POST /github/workspace/commit  { repoPath, message }
router.post("/github/workspace/commit", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const tkn = await getToken(userId);
  if (!tkn) return void res.status(403).json({ error: "GitHub not connected" });

  const { repoPath, message } = req.body as { repoPath: string; message: string };
  if (!repoPath || !message?.trim()) return void res.status(400).json({ error: "repoPath and message required" });

  try {
    const dir = resolveRepoPath(repoPath);
    await git(dir, ["add", "-A"]);

    // Check if anything to commit
    const staged = await git(dir, ["diff", "--cached", "--name-only"]).catch(() => "");
    if (!staged.trim()) return void res.json({ ok: true, committed: false, message: "Nothing to commit" });

    const commitOut = await git(dir, ["commit", "-m", message.trim()]);
    res.json({ ok: true, committed: true, output: commitOut });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Commit failed" });
  }
});

// POST /github/workspace/push  { repoPath }
router.post("/github/workspace/push", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });
  const tkn = await getToken(userId);
  if (!tkn) return void res.status(403).json({ error: "GitHub not connected" });

  const { repoPath } = req.body as { repoPath: string };
  if (!repoPath) return void res.status(400).json({ error: "repoPath required" });

  try {
    const dir = resolveRepoPath(repoPath);
    const branch = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const out = await execFileAsync("git", ["push", "origin", branch], {
      cwd: dir,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 60_000,
    });
    res.json({ ok: true, output: (out.stdout + out.stderr).trim() });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Push failed" });
  }
});

// POST /github/workspace/pull  { repoPath }
router.post("/github/workspace/pull", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { repoPath } = req.body as { repoPath: string };
  if (!repoPath) return void res.status(400).json({ error: "repoPath required" });

  try {
    const dir = resolveRepoPath(repoPath);
    const out = await execFileAsync("git", ["pull", "--rebase"], {
      cwd: dir,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 60_000,
    });
    res.json({ ok: true, output: (out.stdout + out.stderr).trim() });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Pull failed" });
  }
});

// GET /github/workspace/log?repoPath=...&limit=20
router.get("/github/workspace/log", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const repoPath = req.query.repoPath as string | undefined;
  if (!repoPath) return void res.status(400).json({ error: "repoPath required" });
  const limit = Math.min(Number(req.query.limit ?? 20), 100);

  try {
    const dir = resolveRepoPath(repoPath);
    const raw = await git(dir, [
      "log", `--max-count=${limit}`,
      "--pretty=format:%H|%an|%ae|%at|%s",
    ]);

    const commits = raw.split("\n").filter(Boolean).map(line => {
      const [hash, author, email, ts, ...msgParts] = line.split("|");
      return { hash: hash?.slice(0, 8), author, email, date: new Date(Number(ts) * 1000).toISOString(), message: msgParts.join("|") };
    });

    res.json({ commits });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Log failed" });
  }
});

// GET /github/workspace/branches?repoPath=...
router.get("/github/workspace/branches", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const repoPath = req.query.repoPath as string | undefined;
  if (!repoPath) return void res.status(400).json({ error: "repoPath required" });

  try {
    const dir = resolveRepoPath(repoPath);
    const [localRaw, current] = await Promise.all([
      git(dir, ["branch"]),
      git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]),
    ]);
    const branches = localRaw.split("\n").map(b => b.replace(/^\*?\s+/, "").trim()).filter(Boolean);
    res.json({ branches, current });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Branches failed" });
  }
});

// POST /github/workspace/branch  { repoPath, branch, create? }
router.post("/github/workspace/branch", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { repoPath, branch, create } = req.body as { repoPath: string; branch: string; create?: boolean };
  if (!repoPath || !branch) return void res.status(400).json({ error: "repoPath and branch required" });

  try {
    const dir = resolveRepoPath(repoPath);
    if (create) {
      await git(dir, ["checkout", "-b", branch]);
    } else {
      await git(dir, ["checkout", branch]);
    }
    res.json({ ok: true, branch });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Branch switch failed" });
  }
});

// GET /github/workspace/diff?repoPath=...&file=...
router.get("/github/workspace/diff", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const repoPath = req.query.repoPath as string | undefined;
  const file = req.query.file as string | undefined;
  if (!repoPath) return void res.status(400).json({ error: "repoPath required" });

  try {
    const dir = resolveRepoPath(repoPath);
    const args = file ? ["diff", "HEAD", "--", file] : ["diff", "HEAD"];
    const diff = await git(dir, args).catch(() => "");
    res.json({ diff });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Diff failed" });
  }
});

// GET /github/cloned — list cloned repos in workspace
router.get("/github/cloned", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const projectsDir = path.join(getWorkspaceDir(), "projects");
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    const repos = await Promise.all(
      entries
        .filter(e => e.isDirectory())
        .map(async e => {
          const dir = path.join(projectsDir, e.name);
          try {
            await fs.access(path.join(dir, ".git"));
            const [branch, remote] = await Promise.all([
              git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""),
              git(dir, ["remote", "get-url", "origin"]).catch(() => ""),
            ]);
            return {
              name: e.name,
              path: `projects/${e.name}`,
              branch,
              remote: remote.replace(/https:\/\/[^@]+@/, "https://"),
            };
          } catch { return null; }
        })
    );
    res.json({ repos: repos.filter(Boolean) });
  } catch {
    res.json({ repos: [] });
  }
});

export default router;
