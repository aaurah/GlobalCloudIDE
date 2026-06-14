import { Router } from "express";
import fs from "fs/promises";
import path from "path";

const router = Router();

function getWorkspaceRoot(): string {
  const cwd = process.cwd();
  const workspaceRoot = cwd.endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(cwd, "../..")
    : cwd;
  return path.resolve(workspaceRoot, "ide-workspace");
}

function getMemoryPath(): string {
  return path.join(getWorkspaceRoot(), ".ide-memory.json");
}

interface ProjectMemory {
  projectName: string;
  description: string;
  architecture: string[];
  namingConventions: string[];
  codingStyle: string[];
  dependencies: string[];
  notes: string[];
  updatedAt: string;
}

const DEFAULT_MEMORY: ProjectMemory = {
  projectName: "My Project",
  description: "A project built with CloudIDE",
  architecture: [],
  namingConventions: [],
  codingStyle: [],
  dependencies: [],
  notes: [],
  updatedAt: new Date().toISOString(),
};

async function readMemory(): Promise<ProjectMemory> {
  try {
    const raw = await fs.readFile(getMemoryPath(), "utf-8");
    return { ...DEFAULT_MEMORY, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_MEMORY };
  }
}

async function writeMemory(memory: ProjectMemory): Promise<void> {
  const root = getWorkspaceRoot();
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(getMemoryPath(), JSON.stringify(memory, null, 2), "utf-8");
}

// GET /api/memory
router.get("/memory", async (req, res) => {
  try {
    const memory = await readMemory();
    res.json(memory);
  } catch (err) {
    req.log.error({ err }, "Failed to read memory");
    res.status(500).json({ error: "Failed to read memory" });
  }
});

// POST /api/memory
router.post("/memory", async (req, res) => {
  try {
    const current = await readMemory();
    const updated: ProjectMemory = {
      ...current,
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    await writeMemory(updated);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update memory");
    res.status(500).json({ error: "Failed to update memory" });
  }
});

export { readMemory };
export default router;
