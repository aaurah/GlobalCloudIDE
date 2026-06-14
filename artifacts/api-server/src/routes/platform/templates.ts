import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";
import { billingDeduct } from "./billing";
import { hasPurchased } from "./marketplace-engine";

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  description: string;
  stack: string[];
  framework: string;
  language: "typescript" | "javascript" | "python" | "rust" | "go";
  price: number;
  creator: string;
  creatorName: string;
  rating: number;
  ratingCount: number;
  downloads: number;
  category: "frontend" | "backend" | "fullstack" | "mobile" | "data" | "devops";
  tags: string[];
  featured: boolean;
  previewUrl?: string;
  files: { path: string; content: string }[];
  createdAt: string;
  updatedAt: string;
}

// ── Built-in templates (file trees) ─────────────────────────────────────────

const TEMPLATES: Omit<Template, "files">[] = [
  {
    id: "tpl-nextjs-saas",
    name: "Next.js SaaS Starter",
    description: "Production-ready SaaS boilerplate with auth, billing, teams, and dashboard.",
    stack: ["Next.js", "TypeScript", "Prisma", "PostgreSQL", "Stripe", "Tailwind CSS"],
    framework: "nextjs",
    language: "typescript",
    price: 500,
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.9,
    ratingCount: 287,
    downloads: 4820,
    category: "fullstack",
    tags: ["saas", "stripe", "auth", "nextjs"],
    featured: true,
    createdAt: "2024-01-15T00:00:00Z",
    updatedAt: "2024-11-01T00:00:00Z",
  },
  {
    id: "tpl-react-dashboard",
    name: "React Analytics Dashboard",
    description: "Beautiful analytics dashboard with charts, tables, and dark mode.",
    stack: ["React", "TypeScript", "Recharts", "Tailwind CSS", "ShadCN UI"],
    framework: "react",
    language: "typescript",
    price: 300,
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.7,
    ratingCount: 193,
    downloads: 3410,
    category: "frontend",
    tags: ["dashboard", "charts", "analytics"],
    featured: true,
    createdAt: "2024-02-10T00:00:00Z",
    updatedAt: "2024-10-15T00:00:00Z",
  },
  {
    id: "tpl-api-boilerplate",
    name: "REST API Boilerplate",
    description: "Node.js/Express API starter with auth, rate limiting, and OpenAPI docs.",
    stack: ["Node.js", "Express", "TypeScript", "PostgreSQL", "Redis", "Docker"],
    framework: "express",
    language: "typescript",
    price: 250,
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.8,
    ratingCount: 155,
    downloads: 2890,
    category: "backend",
    tags: ["api", "rest", "postgresql", "docker"],
    featured: false,
    createdAt: "2024-03-05T00:00:00Z",
    updatedAt: "2024-09-20T00:00:00Z",
  },
  {
    id: "tpl-mobile-app",
    name: "React Native Starter",
    description: "Cross-platform mobile app with navigation, auth, and push notifications.",
    stack: ["React Native", "Expo", "TypeScript", "Zustand", "React Navigation"],
    framework: "expo",
    language: "typescript",
    price: 400,
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.6,
    ratingCount: 98,
    downloads: 1720,
    category: "mobile",
    tags: ["mobile", "expo", "react-native", "push-notifications"],
    featured: false,
    createdAt: "2024-04-01T00:00:00Z",
    updatedAt: "2024-10-01T00:00:00Z",
  },
  {
    id: "tpl-landing-page",
    name: "Landing Page Kit",
    description: "Beautiful landing page with hero, features, pricing, and CTA sections.",
    stack: ["Next.js", "TypeScript", "Tailwind CSS", "Framer Motion"],
    framework: "nextjs",
    language: "typescript",
    price: 0,
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.5,
    ratingCount: 890,
    downloads: 18400,
    category: "frontend",
    tags: ["landing", "marketing", "animations", "free"],
    featured: false,
    createdAt: "2024-01-05T00:00:00Z",
    updatedAt: "2024-08-01T00:00:00Z",
  },
  {
    id: "tpl-data-pipeline",
    name: "Python Data Pipeline",
    description: "ETL pipeline with Airflow, pandas, and BigQuery integration.",
    stack: ["Python", "Airflow", "Pandas", "BigQuery", "Docker"],
    framework: "airflow",
    language: "python",
    price: 350,
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.7,
    ratingCount: 72,
    downloads: 1240,
    category: "data",
    tags: ["etl", "python", "airflow", "data"],
    featured: false,
    createdAt: "2024-05-10T00:00:00Z",
    updatedAt: "2024-10-20T00:00:00Z",
  },
];

// ── Starter file content generators ─────────────────────────────────────────

function generateStarterFiles(templateId: string): { path: string; content: string }[] {
  switch (templateId) {
    case "tpl-landing-page":
      return [
        { path: "README.md", content: "# Landing Page Kit\n\nBuilt with Next.js + Tailwind CSS.\n\n## Getting Started\n\n```bash\nnpm install\nnpm run dev\n```\n" },
        { path: "package.json", content: JSON.stringify({ name: "landing-page", version: "1.0.0", scripts: { dev: "next dev", build: "next build", start: "next start" }, dependencies: { next: "^14.0.0", react: "^18.0.0", "react-dom": "^18.0.0" }, devDependencies: { typescript: "^5.0.0", tailwindcss: "^3.0.0" } }, null, 2) },
        { path: "app/page.tsx", content: `export default function Home() {\n  return (\n    <main className="min-h-screen">\n      <section className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 text-white px-4">\n        <h1 className="text-6xl font-bold mb-4">Your Product</h1>\n        <p className="text-xl text-slate-300 mb-8 max-w-lg text-center">The tagline that converts visitors into customers.</p>\n        <button className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-lg transition-colors">Get Started Free</button>\n      </section>\n    </main>\n  );\n}\n` },
      ];
    case "tpl-api-boilerplate":
      return [
        { path: "README.md", content: "# REST API Boilerplate\n\nExpress + TypeScript + PostgreSQL\n\n## Setup\n\n```bash\nnpm install\ncp .env.example .env\nnpm run dev\n```\n" },
        { path: "package.json", content: JSON.stringify({ name: "api-boilerplate", version: "1.0.0", scripts: { dev: "ts-node-dev src/index.ts", build: "tsc", start: "node dist/index.js" }, dependencies: { express: "^4.18.0", cors: "^2.8.5", "express-rate-limit": "^7.0.0" }, devDependencies: { typescript: "^5.0.0", "@types/express": "^4.17.0" } }, null, 2) },
        { path: "src/index.ts", content: `import express from 'express';\nimport cors from 'cors';\n\nconst app = express();\napp.use(cors());\napp.use(express.json());\n\napp.get('/health', (_, res) => res.json({ ok: true }));\n\nconst port = process.env.PORT ?? 3000;\napp.listen(port, () => console.log(\`API listening on port \${port}\`));\n` },
        { path: ".env.example", content: "PORT=3000\nDATABASE_URL=postgresql://user:pass@localhost:5432/mydb\nJWT_SECRET=change-me\n" },
      ];
    default:
      return [
        { path: "README.md", content: `# ${TEMPLATES.find(t => t.id === templateId)?.name ?? "Template"}\n\nGet started by reading the documentation.\n` },
        { path: "package.json", content: JSON.stringify({ name: templateId, version: "1.0.0" }, null, 2) },
      ];
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /templates/list
router.get("/templates/list", async (req, res) => {
  const { category, language, search } = req.query as Record<string, string>;
  let templates = [...TEMPLATES];
  if (category) templates = templates.filter(t => t.category === category);
  if (language) templates = templates.filter(t => t.language === language);
  if (search) {
    const q = search.toLowerCase();
    templates = templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.includes(q))
    );
  }
  res.json({ templates });
});

// GET /templates/categories
router.get("/templates/categories", (_req, res) => {
  const cats = [...new Set(TEMPLATES.map(t => t.category))];
  res.json({ categories: cats });
});

// GET /templates/:id
router.get("/templates/:id", async (req, res) => {
  const tpl = TEMPLATES.find(t => t.id === req.params.id);
  if (!tpl) return void res.status(404).json({ error: "Not found" });

  const userId = getAuthUser(req.headers.authorization);
  const purchased = userId ? await hasPurchased(userId, req.params.id) : false;
  const files = purchased ? generateStarterFiles(req.params.id) : [];

  res.json({ template: tpl, purchased, files });
});

// POST /templates/purchase
router.post("/templates/purchase", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { templateId } = req.body as { templateId: string };
  const tpl = TEMPLATES.find(t => t.id === templateId);
  if (!tpl) return void res.status(404).json({ error: "Template not found" });

  if (tpl.price === 0) {
    const files = generateStarterFiles(templateId);
    return void res.json({ ok: true, free: true, files });
  }

  const alreadyOwned = await hasPurchased(userId, templateId);
  if (alreadyOwned) {
    const files = generateStarterFiles(templateId);
    return void res.json({ ok: true, alreadyOwned: true, files });
  }

  const ok = await billingDeduct(userId, tpl.price, "ai-call", `Template purchase: ${tpl.name}`);
  if (!ok) return void res.status(402).json({ error: "Insufficient credits" });

  // Record purchase via marketplace engine
  const { default: mpRouter, ...mp } = await import("./marketplace-engine");
  void mpRouter; // ensure import side effects

  const purchases = await (await import("./marketplace-engine")).hasPurchased;
  void purchases;

  const pdir = (() => {
    const cwd = process.cwd();
    const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
    return path.resolve(root, "ide-workspace/.platform");
  })();
  const pfile = path.join(pdir, "marketplace-purchases.json");
  let ps: unknown[] = [];
  try { ps = JSON.parse(await fs.readFile(pfile, "utf-8")); } catch {}
  ps.push({ id: randomUUID(), userId, itemId: templateId, amount: tpl.price, pricingModel: "one-time", purchasedAt: new Date().toISOString(), active: true });
  await fs.mkdir(pdir, { recursive: true });
  await fs.writeFile(pfile, JSON.stringify(ps, null, 2));

  TEMPLATES.find(t => t.id === templateId)!.downloads++;
  const files = generateStarterFiles(templateId);
  res.json({ ok: true, files });
});

export default router;
