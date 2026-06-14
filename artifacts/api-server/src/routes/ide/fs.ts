import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { logger } from "../../lib/logger";
import {
  ListFilesQueryParams,
  ReadFileQueryParams,
  WriteFileBody,
  DeleteFileQueryParams,
  RenameFileBody,
  MakeDirectoryBody,
} from "@workspace/api-zod";

const router = Router();

function getWorkspaceRoot(): string {
  const cwd = process.cwd();
  const workspaceRoot = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(workspaceRoot, "ide-workspace");
}

function safePath(userPath: string): string {
  const root = getWorkspaceRoot();
  const resolved = path.resolve(root, userPath.replace(/^\//, ""));
  if (!resolved.startsWith(root)) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

interface FileEntryResult {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileEntryResult[];
}

async function buildTree(dirPath: string, rootPath: string): Promise<FileEntryResult[]> {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: FileEntryResult[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = "/" + path.relative(rootPath, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, rootPath);
      results.push({ name: entry.name, path: relativePath, type: "directory", children });
    } else {
      let size: number | undefined;
      try {
        const stat = await fs.stat(fullPath);
        size = stat.size;
      } catch {
        size = 0;
      }
      results.push({ name: entry.name, path: relativePath, type: "file", size });
    }
  }

  return results.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// GET /api/fs/list
router.get("/fs/list", async (req, res) => {
  const parsed = ListFilesQueryParams.safeParse(req.query);
  const userPath = parsed.success ? (parsed.data.path ?? "/") : "/";

  try {
    const root = getWorkspaceRoot();
    await fs.mkdir(root, { recursive: true });
    const dirPath = safePath(userPath);
    const tree = await buildTree(dirPath, root);
    res.json(tree);
  } catch (err) {
    req.log.error({ err }, "Failed to list files");
    res.status(500).json({ error: "Failed to list files" });
  }
});

// GET /api/fs/read
router.get("/fs/read", async (req, res) => {
  const parsed = ReadFileQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing path parameter" });
    return;
  }

  try {
    const filePath = safePath(parsed.data.path);
    const content = await fs.readFile(filePath, "utf-8");
    res.json({ path: parsed.data.path, content });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      res.status(404).json({ error: "File not found" });
    } else {
      req.log.error({ err }, "Failed to read file");
      res.status(500).json({ error: "Failed to read file" });
    }
  }
});

// POST /api/fs/write
router.post("/fs/write", async (req, res) => {
  const parsed = WriteFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  try {
    const filePath = safePath(parsed.data.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, parsed.data.content, "utf-8");
    res.json({ success: true, message: "File saved" });
  } catch (err) {
    req.log.error({ err }, "Failed to write file");
    res.status(500).json({ error: "Failed to write file" });
  }
});

// DELETE /api/fs/delete
router.delete("/fs/delete", async (req, res) => {
  const parsed = DeleteFileQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing path parameter" });
    return;
  }

  try {
    const filePath = safePath(parsed.data.path);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      await fs.unlink(filePath);
    }
    res.json({ success: true, message: "Deleted" });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      res.status(404).json({ error: "File not found" });
    } else {
      req.log.error({ err }, "Failed to delete file");
      res.status(500).json({ error: "Failed to delete" });
    }
  }
});

// POST /api/fs/rename
router.post("/fs/rename", async (req, res) => {
  const parsed = RenameFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  try {
    const oldPath = safePath(parsed.data.oldPath);
    const newPath = safePath(parsed.data.newPath);
    await fs.mkdir(path.dirname(newPath), { recursive: true });
    await fs.rename(oldPath, newPath);
    res.json({ success: true, message: "Renamed" });
  } catch (err) {
    req.log.error({ err }, "Failed to rename file");
    res.status(500).json({ error: "Failed to rename" });
  }
});

// POST /api/fs/mkdir
router.post("/fs/mkdir", async (req, res) => {
  const parsed = MakeDirectoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  try {
    const dirPath = safePath(parsed.data.path);
    await fs.mkdir(dirPath, { recursive: true });
    res.json({ success: true, message: "Directory created" });
  } catch (err) {
    req.log.error({ err }, "Failed to create directory");
    res.status(500).json({ error: "Failed to create directory" });
  }
});

export default router;
