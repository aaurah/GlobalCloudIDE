import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getAuthUser } from "./auth";
import { billingDeduct, getUserBilling } from "./billing";

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────

export type ItemType = "plugin" | "agent" | "template" | "component";
export type PricingModel = "free" | "one-time" | "subscription" | "usage-based";

export interface MarketplaceItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  longDescription: string;
  price: number;
  pricingModel: PricingModel;
  subscriptionPricePerMonth?: number;
  usagePricePerCall?: number;
  creator: string;
  creatorName: string;
  rating: number;
  ratingCount: number;
  downloads: number;
  version: string;
  icon: string;
  category: string;
  tags: string[];
  featured: boolean;
  screenshots: string[];
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

export interface Purchase {
  id: string;
  userId: string;
  itemId: string;
  amount: number;
  pricingModel: PricingModel;
  purchasedAt: string;
  subscriptionActiveUntil?: string;
  active: boolean;
}

export interface Review {
  id: string;
  itemId: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: string;
  helpful: number;
}

// ── Built-in catalog ─────────────────────────────────────────────────────────

const CATALOG: MarketplaceItem[] = [
  // Templates
  {
    id: "tpl-nextjs-saas",
    type: "template",
    name: "Next.js SaaS Starter",
    description: "Production-ready SaaS boilerplate with auth, billing, teams, and dashboard.",
    longDescription: "Complete SaaS foundation: Next.js 14, Prisma, Stripe, Auth.js, Shadcn UI, multi-tenant teams, subscription billing, admin dashboard. Launch your SaaS in days.",
    price: 500,
    pricingModel: "one-time",
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.9,
    ratingCount: 287,
    downloads: 4820,
    version: "2.0.0",
    icon: "⚡",
    category: "template",
    tags: ["nextjs", "saas", "typescript", "stripe"],
    featured: true,
    screenshots: [],
    createdAt: "2024-01-15T00:00:00Z",
    updatedAt: "2024-11-01T00:00:00Z",
    active: true,
  },
  {
    id: "tpl-react-dashboard",
    type: "template",
    name: "React Analytics Dashboard",
    description: "Beautiful analytics dashboard with charts, tables, and dark mode.",
    longDescription: "Fully responsive analytics dashboard built with React, Recharts, Tailwind CSS. Includes 20+ chart types, data tables, filters, exports, and dark/light mode.",
    price: 300,
    pricingModel: "one-time",
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.7,
    ratingCount: 193,
    downloads: 3410,
    version: "1.3.0",
    icon: "📊",
    category: "template",
    tags: ["react", "dashboard", "charts", "tailwind"],
    featured: true,
    screenshots: [],
    createdAt: "2024-02-10T00:00:00Z",
    updatedAt: "2024-10-15T00:00:00Z",
    active: true,
  },
  {
    id: "tpl-api-boilerplate",
    type: "template",
    name: "REST API Boilerplate",
    description: "Node.js/Express API starter with auth, rate limiting, and OpenAPI docs.",
    longDescription: "Production-grade REST API: Express, TypeScript, PostgreSQL, JWT auth, Redis rate limiting, auto-generated OpenAPI docs, Docker, and CI/CD pipeline.",
    price: 250,
    pricingModel: "one-time",
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.8,
    ratingCount: 155,
    downloads: 2890,
    version: "1.5.0",
    icon: "🔗",
    category: "template",
    tags: ["nodejs", "express", "postgresql", "typescript"],
    featured: false,
    screenshots: [],
    createdAt: "2024-03-05T00:00:00Z",
    updatedAt: "2024-09-20T00:00:00Z",
    active: true,
  },
  {
    id: "tpl-mobile-app",
    type: "template",
    name: "React Native Starter",
    description: "Cross-platform mobile app with navigation, auth, and push notifications.",
    longDescription: "Full React Native app template with Expo, React Navigation v6, Zustand, auth flow, push notifications, biometric login, and OTA updates.",
    price: 400,
    pricingModel: "one-time",
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.6,
    ratingCount: 98,
    downloads: 1720,
    version: "1.1.0",
    icon: "📱",
    category: "template",
    tags: ["react-native", "expo", "mobile", "typescript"],
    featured: false,
    screenshots: [],
    createdAt: "2024-04-01T00:00:00Z",
    updatedAt: "2024-10-01T00:00:00Z",
    active: true,
  },
  // Premium plugins
  {
    id: "plg-ai-autocomplete-pro",
    type: "plugin",
    name: "AI Autocomplete Pro",
    description: "Context-aware multi-line code completion powered by GPT-4o.",
    longDescription: "Supercharge your coding with GPT-4o-powered completions. Understands your entire project context, suggests complete functions, handles edge cases, and learns your style.",
    price: 0,
    pricingModel: "subscription",
    subscriptionPricePerMonth: 150,
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.9,
    ratingCount: 542,
    downloads: 9200,
    version: "3.0.0",
    icon: "🤖",
    category: "ai",
    tags: ["ai", "autocomplete", "gpt4", "productivity"],
    featured: true,
    screenshots: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-11-10T00:00:00Z",
    active: true,
  },
  {
    id: "plg-git-history",
    type: "plugin",
    name: "Git History Pro",
    description: "Visual git history, blame, time travel, and interactive rebase UI.",
    longDescription: "Complete git visualization: file history timeline, blame view, commit graph, interactive rebase UI, stash manager, and conflict resolver.",
    price: 200,
    pricingModel: "one-time",
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.7,
    ratingCount: 318,
    downloads: 5640,
    version: "2.2.0",
    icon: "🔀",
    category: "vcs",
    tags: ["git", "history", "blame", "vcs"],
    featured: false,
    screenshots: [],
    createdAt: "2024-02-20T00:00:00Z",
    updatedAt: "2024-10-05T00:00:00Z",
    active: true,
  },
  {
    id: "plg-test-runner-pro",
    type: "plugin",
    name: "Test Runner Pro",
    description: "Visual test runner with coverage, snapshots, and CI integration.",
    longDescription: "Run Jest, Vitest, Mocha tests with live results, inline coverage bars, snapshot diffing, failed test re-running, and GitHub Actions integration.",
    price: 180,
    pricingModel: "one-time",
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.8,
    ratingCount: 204,
    downloads: 3890,
    version: "1.8.0",
    icon: "✅",
    category: "testing",
    tags: ["testing", "jest", "vitest", "coverage"],
    featured: false,
    screenshots: [],
    createdAt: "2024-03-15T00:00:00Z",
    updatedAt: "2024-09-28T00:00:00Z",
    active: true,
  },
  // Premium agents
  {
    id: "agt-architect-pro",
    type: "agent",
    name: "Architect Pro",
    description: "System design AI that generates full architecture diagrams and scaffolding.",
    longDescription: "Describe your product and get complete system architecture: database schema, API design, microservice layout, infrastructure config, and auto-scaffolded boilerplate.",
    price: 0,
    pricingModel: "usage-based",
    usagePricePerCall: 10,
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.8,
    ratingCount: 167,
    downloads: 2840,
    version: "1.4.0",
    icon: "🏛️",
    category: "architecture",
    tags: ["architecture", "design", "scaffold", "ai"],
    featured: true,
    screenshots: [],
    createdAt: "2024-02-01T00:00:00Z",
    updatedAt: "2024-11-05T00:00:00Z",
    active: true,
  },
  {
    id: "agt-security-auditor",
    type: "agent",
    name: "Security Auditor",
    description: "Full security audit: OWASP top 10, dependency CVEs, secret scanning.",
    longDescription: "Comprehensive security agent: scans for OWASP Top 10 vulnerabilities, checks npm/pip dependencies for CVEs, detects hardcoded secrets, and generates security report with fixes.",
    price: 350,
    pricingModel: "one-time",
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.9,
    ratingCount: 213,
    downloads: 3720,
    version: "2.1.0",
    icon: "🛡️",
    category: "security",
    tags: ["security", "owasp", "cve", "audit"],
    featured: true,
    screenshots: [],
    createdAt: "2024-03-10T00:00:00Z",
    updatedAt: "2024-10-20T00:00:00Z",
    active: true,
  },
  // Free items
  {
    id: "tpl-landing-page",
    type: "template",
    name: "Landing Page Kit",
    description: "Beautiful landing page with hero, features, pricing, and CTA sections.",
    longDescription: "Conversion-optimized landing page with hero, features grid, social proof, pricing table, FAQ, and newsletter signup. Built with Next.js and Tailwind CSS.",
    price: 0,
    pricingModel: "free",
    creator: "system",
    creatorName: "CloudIDE Team",
    rating: 4.5,
    ratingCount: 890,
    downloads: 18400,
    version: "1.0.0",
    icon: "🚀",
    category: "template",
    tags: ["landing", "marketing", "nextjs", "free"],
    featured: false,
    screenshots: [],
    createdAt: "2024-01-05T00:00:00Z",
    updatedAt: "2024-08-01T00:00:00Z",
    active: true,
  },
];

// ── Storage helpers ──────────────────────────────────────────────────────────

function getPlatformDir() {
  const cwd = process.cwd();
  const root = cwd.endsWith(path.join("artifacts", "api-server")) ? path.resolve(cwd, "../..") : cwd;
  return path.resolve(root, "ide-workspace/.platform");
}

async function readJson<T>(file: string, def: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(path.join(getPlatformDir(), file), "utf-8")); }
  catch { return def; }
}

async function writeJson(file: string, data: unknown) {
  const dir = getPlatformDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), JSON.stringify(data, null, 2));
}

async function readPurchases(): Promise<Purchase[]> { return readJson("marketplace-purchases.json", []); }
async function writePurchases(d: Purchase[]) { return writeJson("marketplace-purchases.json", d); }
async function readReviews(): Promise<Review[]> { return readJson("marketplace-reviews.json", []); }
async function writeReviews(d: Review[]) { return writeJson("marketplace-reviews.json", d); }
async function readUserItems(): Promise<MarketplaceItem[]> { return readJson("marketplace-items.json", []); }

function allItems(userItems: MarketplaceItem[]) {
  return [...CATALOG, ...userItems].filter(i => i.active);
}

export async function hasPurchased(userId: string, itemId: string): Promise<boolean> {
  const item = allItems(await readUserItems()).find(i => i.id === itemId);
  if (!item || item.pricingModel === "free") return true;
  const purchases = await readPurchases();
  return purchases.some(p => p.userId === userId && p.itemId === itemId && p.active);
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /marketplace/list
router.get("/marketplace/list", async (req, res) => {
  const { type, category, pricing, sort = "downloads", search } = req.query as Record<string, string>;
  const userItems = await readUserItems();
  let items = allItems(userItems);

  if (type) items = items.filter(i => i.type === type);
  if (category) items = items.filter(i => i.category === category);
  if (pricing === "free") items = items.filter(i => i.pricingModel === "free");
  if (pricing === "paid") items = items.filter(i => i.pricingModel !== "free");
  if (search) {
    const q = search.toLowerCase();
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.tags.some(t => t.includes(q))
    );
  }

  if (sort === "rating") items.sort((a, b) => b.rating - a.rating);
  else if (sort === "newest") items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (sort === "price-asc") items.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") items.sort((a, b) => b.price - a.price);
  else items.sort((a, b) => b.downloads - a.downloads);

  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 100);
  const offset = parseInt(String(req.query.offset ?? "0"));

  res.json({ items: items.slice(offset, offset + limit), total: items.length });
});

// GET /marketplace/trending
router.get("/marketplace/trending", async (_req, res) => {
  const userItems = await readUserItems();
  const items = allItems(userItems);
  const purchases = await readPurchases();

  // Score by recent activity
  const now = Date.now();
  const week = 7 * 24 * 3600 * 1000;
  const recentPurchases = purchases.filter(p => now - new Date(p.purchasedAt).getTime() < week);
  const scores = new Map<string, number>();
  for (const p of recentPurchases) scores.set(p.itemId, (scores.get(p.itemId) ?? 0) + 1);

  const trending = items
    .map(i => ({ ...i, _score: (scores.get(i.id) ?? 0) * 10 + i.downloads / 100 + i.rating * 5 }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 20)
    .map(({ _score: _, ...i }) => i);

  res.json({ items: trending });
});

// GET /marketplace/featured
router.get("/marketplace/featured", async (_req, res) => {
  const userItems = await readUserItems();
  const items = allItems(userItems).filter(i => i.featured).slice(0, 8);
  res.json({ items });
});

// GET /marketplace/search
router.get("/marketplace/search", async (req, res) => {
  const q = String(req.query.q ?? "").toLowerCase().trim();
  if (!q) return void res.json({ items: [] });
  const userItems = await readUserItems();
  const items = allItems(userItems).filter(i =>
    i.name.toLowerCase().includes(q) ||
    i.description.toLowerCase().includes(q) ||
    i.tags.some(t => t.includes(q)) ||
    i.category.includes(q)
  );
  res.json({ items: items.slice(0, 30) });
});

// GET /marketplace/item/:id
router.get("/marketplace/item/:id", async (req, res) => {
  const userItems = await readUserItems();
  const item = allItems(userItems).find(i => i.id === req.params.id);
  if (!item) return void res.status(404).json({ error: "Not found" });

  const reviews = (await readReviews()).filter(r => r.itemId === req.params.id);
  const userId = getAuthUser(req.headers.authorization);
  const purchased = userId ? await hasPurchased(userId, req.params.id) : false;

  res.json({ item, reviews: reviews.slice(-10), purchased });
});

// GET /marketplace/purchased
router.get("/marketplace/purchased", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const purchases = (await readPurchases()).filter(p => p.userId === userId && p.active);
  const userItems = await readUserItems();
  const items = allItems(userItems);

  const result = purchases.map(p => {
    const item = items.find(i => i.id === p.itemId);
    return { purchase: p, item };
  }).filter(r => r.item);

  res.json({ items: result });
});

// POST /marketplace/purchase
router.post("/marketplace/purchase", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { itemId } = req.body as { itemId: string };
  const userItems = await readUserItems();
  const item = allItems(userItems).find(i => i.id === itemId);
  if (!item) return void res.status(404).json({ error: "Item not found" });
  if (item.pricingModel === "free") return void res.json({ ok: true, free: true });

  // Check already purchased
  const purchases = await readPurchases();
  if (purchases.some(p => p.userId === userId && p.itemId === itemId && p.active)) {
    return void res.json({ ok: true, alreadyOwned: true });
  }

  const cost = item.pricingModel === "subscription"
    ? (item.subscriptionPricePerMonth ?? item.price)
    : item.price;

  const ok = await billingDeduct(userId, cost, "ai-call",
    `Marketplace purchase: ${item.name}`);
  if (!ok) return void res.status(402).json({ error: "Insufficient credits" });

  // Creator gets 70%
  const creatorShare = Math.floor(cost * 0.7);
  if (item.creator !== "system" && creatorShare > 0) {
    const { addCreatorEarning } = await import("./creator");
    await addCreatorEarning(item.creator, item.id, creatorShare, userId);
  }

  const purchase: Purchase = {
    id: randomUUID(),
    userId,
    itemId,
    amount: cost,
    pricingModel: item.pricingModel,
    purchasedAt: new Date().toISOString(),
    subscriptionActiveUntil: item.pricingModel === "subscription"
      ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
      : undefined,
    active: true,
  };
  purchases.push(purchase);
  await writePurchases(purchases);

  // Update download count
  const systemItem = CATALOG.find(i => i.id === itemId);
  if (systemItem) systemItem.downloads++;

  res.json({ ok: true, purchase });
});

// POST /marketplace/review
router.post("/marketplace/review", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { itemId, rating, comment } = req.body as { itemId: string; rating: number; comment: string };
  if (!itemId || !rating || rating < 1 || rating > 5) return void res.status(400).json({ error: "Invalid review" });

  const purchased = await hasPurchased(userId, itemId);
  if (!purchased) return void res.status(403).json({ error: "Must purchase before reviewing" });

  const reviews = await readReviews();
  const existing = reviews.findIndex(r => r.userId === userId && r.itemId === itemId);
  const review: Review = {
    id: existing >= 0 ? reviews[existing].id : randomUUID(),
    itemId, userId, rating,
    comment: comment?.slice(0, 500) ?? "",
    createdAt: new Date().toISOString(),
    helpful: existing >= 0 ? reviews[existing].helpful : 0,
  };

  if (existing >= 0) reviews[existing] = review; else reviews.push(review);
  await writeReviews(reviews);

  // Recalculate item rating
  const itemReviews = reviews.filter(r => r.itemId === itemId);
  const avg = itemReviews.reduce((s, r) => s + r.rating, 0) / itemReviews.length;
  const systemItem = CATALOG.find(i => i.id === itemId);
  if (systemItem) { systemItem.rating = Math.round(avg * 10) / 10; systemItem.ratingCount = itemReviews.length; }

  res.json({ ok: true, review });
});

// GET /marketplace/categories
router.get("/marketplace/categories", async (_req, res) => {
  const userItems = await readUserItems();
  const items = allItems(userItems);
  const cats = new Map<string, number>();
  for (const i of items) cats.set(i.category, (cats.get(i.category) ?? 0) + 1);
  const categories = Array.from(cats.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  res.json({ categories });
});

// POST /marketplace/ai/recommend
router.post("/marketplace/ai/recommend", async (req, res) => {
  const userId = getAuthUser(req.headers.authorization);
  if (!userId) return void res.status(401).json({ error: "Unauthorized" });

  const { context } = req.body as { context?: string };
  const purchases = (await readPurchases()).filter(p => p.userId === userId);
  const ownedIds = new Set(purchases.map(p => p.itemId));
  const userItems = await readUserItems();
  const items = allItems(userItems).filter(i => !ownedIds.has(i.id));

  // Simple rule-based recommendations (no AI cost)
  const billing = await getUserBilling(userId);
  let recommended = items.filter(i => i.featured);
  if (billing.plan === "free") recommended = recommended.filter(i => i.price <= 200);
  recommended = recommended.sort((a, b) => b.rating - a.rating).slice(0, 6);

  res.json({ recommendations: recommended, reason: context ? `Based on: ${context}` : "Trending and highly rated" });
});

export default router;
