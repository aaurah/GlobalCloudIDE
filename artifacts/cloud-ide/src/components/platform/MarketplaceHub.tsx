import React, { useState, useEffect, useCallback } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import {
  Search, Star, Download, Zap, Package, BrainCircuit,
  FileCode, TrendingUp, ShoppingCart, Check, Loader2,
  RefreshCw, Filter, Tag, Crown,
} from "lucide-react";
import { cn } from "../../lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemType = "plugin" | "agent" | "template" | "component";
type PricingModel = "free" | "one-time" | "subscription" | "usage-based";

interface MarketplaceItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
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
}

type HubTab = "browse" | "plugins" | "agents" | "templates" | "purchased";

const TYPE_ICONS: Record<ItemType, React.ReactNode> = {
  plugin:    <Package size={11} />,
  agent:     <BrainCircuit size={11} />,
  template:  <FileCode size={11} />,
  component: <Zap size={11} />,
};

function priceLabel(item: MarketplaceItem) {
  if (item.pricingModel === "free") return "Free";
  if (item.pricingModel === "subscription") return `${item.subscriptionPricePerMonth ?? item.price}cr/mo`;
  if (item.pricingModel === "usage-based") return `${item.usagePricePerCall ?? item.price}cr/call`;
  return `${item.price} cr`;
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1">
      <Star size={10} className="text-yellow-400 fill-yellow-400" />
      <span className="text-[10px] font-medium tabular-nums">{rating.toFixed(1)}</span>
      <span className="text-[10px] text-muted-foreground">({count})</span>
    </div>
  );
}

// ── ItemCard ──────────────────────────────────────────────────────────────────

function ItemCard({ item, onSelect, purchased }: {
  item: MarketplaceItem;
  onSelect: (item: MarketplaceItem) => void;
  purchased: boolean;
}) {
  return (
    <button onClick={() => onSelect(item)}
      className="w-full text-left p-3 rounded-xl border border-border hover:border-muted-foreground/30 bg-card hover:bg-muted/20 transition-all space-y-2">
      <div className="flex items-start gap-2.5">
        <div className="text-2xl leading-none mt-0.5 shrink-0">{item.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold leading-tight truncate">{item.name}</span>
            {item.featured && <Crown size={9} className="text-yellow-400 shrink-0" />}
            {purchased && <Check size={9} className="text-green-400 shrink-0" />}
          </div>
          <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{item.description}</div>
        </div>
        <Badge className={cn(
          "shrink-0 text-[9px] h-4 px-1.5 font-semibold border",
          item.pricingModel === "free"
            ? "bg-green-900/30 text-green-400 border-green-800/30"
            : "bg-blue-900/30 text-blue-400 border-blue-800/30"
        )}>
          {priceLabel(item)}
        </Badge>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <StarRating rating={item.rating} count={item.ratingCount} />
        <div className="flex items-center gap-1"><Download size={9} />{item.downloads.toLocaleString()}</div>
        <div className="flex items-center gap-1">{TYPE_ICONS[item.type]}<span className="capitalize">{item.type}</span></div>
      </div>
    </button>
  );
}

// ── ItemDetail ────────────────────────────────────────────────────────────────

function ItemDetail({ item, onBack, token }: { item: MarketplaceItem; onBack: () => void; token: string }) {
  const [detail, setDetail] = useState<{ purchased: boolean; reviews: any[] } | null>(null);
  const [buying, setBuying] = useState(false);
  const [done, setDone] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const h = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`/api/marketplace/item/${item.id}`, { headers: h })
      .then(r => r.json()).then(d => setDetail(d)).catch(() => {});
  }, [item.id]);

  const handleBuy = async () => {
    setBuying(true);
    try {
      const r = await fetch("/api/marketplace/purchase", { method: "POST", headers: h, body: JSON.stringify({ itemId: item.id }) });
      const d = await r.json();
      if (d.ok) { setDone(true); setDetail(prev => prev ? { ...prev, purchased: true } : null); }
    } finally { setBuying(false); }
  };

  const submitReview = async () => {
    setSubmittingReview(true);
    try {
      await fetch("/api/marketplace/review", { method: "POST", headers: h, body: JSON.stringify({ itemId: item.id, rating: reviewRating, comment: reviewText }) });
      setReviewText("");
      const r = await fetch(`/api/marketplace/item/${item.id}`, { headers: h });
      setDetail(await r.json());
    } finally { setSubmittingReview(false); }
  };

  const purchased = done || detail?.purchased;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <button onClick={onBack} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">← Back</button>
        <div className="text-xs font-semibold truncate">{item.name}</div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="text-4xl">{item.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{item.name}</div>
              <div className="text-[10px] text-muted-foreground">by {item.creatorName} · v{item.version}</div>
              <StarRating rating={item.rating} count={item.ratingCount} />
            </div>
          </div>

          {/* Price + action */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">{priceLabel(item)}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{item.pricingModel.replace("-", " ")}</div>
              </div>
              {purchased ? (
                <div className="flex items-center gap-1.5 text-green-400 text-xs font-semibold">
                  <Check size={13} /> Owned
                </div>
              ) : (
                <Button size="sm" className="h-8 text-xs px-4" disabled={buying} onClick={handleBuy}>
                  {buying ? <Loader2 size={12} className="animate-spin" /> :
                    item.pricingModel === "free" ? "Install Free" :
                    <><ShoppingCart size={11} className="mr-1" />Purchase</>}
                </Button>
              )}
            </div>
            <div className="flex gap-2 text-[10px] text-muted-foreground">
              <span><Download size={9} className="inline" /> {item.downloads.toLocaleString()} installs</span>
              <span>· {item.category}</span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Description</div>
            <p className="text-xs text-foreground/80 leading-relaxed">{item.description}</p>
          </div>

          {/* Tags */}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/40 text-[10px] text-muted-foreground">
                  <Tag size={8} />{tag}
                </span>
              ))}
            </div>
          )}

          {/* Reviews */}
          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Reviews</div>
            {detail?.reviews.map((r: any) => (
              <div key={r.id} className="rounded-lg border border-border p-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map(s => <Star key={s} size={9} className={cn(s <= r.rating ? "text-yellow-400 fill-yellow-400" : "text-muted")} />)}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{r.timestamp?.slice(0, 10) ?? ""}</span>
                </div>
                {r.comment && <p className="text-[10px] text-foreground/70">{r.comment}</p>}
              </div>
            ))}
            {detail?.reviews.length === 0 && <p className="text-[10px] text-muted-foreground italic">No reviews yet</p>}

            {/* Write review */}
            {purchased && (
              <div className="space-y-2 pt-1">
                <div className="text-[10px] font-semibold text-muted-foreground">Write a review</div>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setReviewRating(s)}>
                      <Star size={14} className={cn(s <= reviewRating ? "text-yellow-400 fill-yellow-400" : "text-muted")} />
                    </button>
                  ))}
                </div>
                <textarea
                  className="w-full bg-input border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 ring-primary resize-none"
                  rows={3} placeholder="Share your experience..." value={reviewText}
                  onChange={e => setReviewText(e.target.value)} />
                <Button size="sm" className="h-7 text-xs w-full" disabled={submittingReview} onClick={submitReview}>
                  {submittingReview ? <Loader2 size={11} className="animate-spin" /> : "Submit Review"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function MarketplaceHub() {
  const { token } = usePlatform();
  const [tab, setTab] = useState<HubTab>("browse");
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [trending, setTrending] = useState<MarketplaceItem[]>([]);
  const [purchased, setPurchased] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("downloads");
  const [selected, setSelected] = useState<MarketplaceItem | null>(null);

  const h = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const loadItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const typeMap: Partial<Record<HubTab, string>> = { plugins: "plugin", agents: "agent", templates: "template" };
      const params = new URLSearchParams({ limit: "40", sort: sortBy });
      if (typeMap[tab]) params.set("type", typeMap[tab]!);
      if (search) params.set("search", search);

      const [itemsRes, purchasedRes] = await Promise.all([
        tab === "purchased"
          ? fetch("/api/marketplace/purchased", { headers: h() }).then(r => r.json())
          : fetch(`/api/marketplace/list?${params}`, { headers: h() }).then(r => r.json()),
        fetch("/api/marketplace/purchased", { headers: h() }).then(r => r.json()),
      ]);

      if (tab === "purchased") {
        setItems((itemsRes.items ?? []).map((r: any) => r.item).filter(Boolean));
      } else {
        setItems(itemsRes.items ?? []);
      }

      const ownedIds = new Set<string>((purchasedRes.items ?? []).map((r: any) => r.item?.id).filter(Boolean));
      // Free items are always "purchased"
      for (const item of items) { if (item.pricingModel === "free") ownedIds.add(item.id); }
      setPurchased(ownedIds);
    } catch {}
    setLoading(false);
  }, [token, tab, search, sortBy, h]);

  const loadTrending = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/marketplace/trending", { headers: h() });
      const d = await r.json();
      setTrending(d.items ?? []);
    } catch {}
  }, [token, h]);

  useEffect(() => { loadItems(); }, [tab, sortBy]);
  useEffect(() => { loadTrending(); }, [token]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); loadItems(); };

  const TABS: { id: HubTab; label: string; icon: React.ReactNode }[] = [
    { id: "browse",    label: "Browse",     icon: <TrendingUp size={10} /> },
    { id: "plugins",   label: "Plugins",    icon: <Package size={10} /> },
    { id: "agents",    label: "Agents",     icon: <BrainCircuit size={10} /> },
    { id: "templates", label: "Templates",  icon: <FileCode size={10} /> },
    { id: "purchased", label: "Purchased",  icon: <Check size={10} /> },
  ];

  if (selected) {
    return <ItemDetail item={selected} onBack={() => setSelected(null)} token={token ?? ""} />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-border shrink-0 scrollbar-hide bg-background/30">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-2 text-[10px] font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {t.icon}{t.label}
          </button>
        ))}
        <button onClick={() => { loadItems(); loadTrending(); }}
          className="ml-auto px-2 text-muted-foreground hover:text-foreground">
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Search + filters */}
      {tab !== "purchased" && (
        <div className="px-3 py-2 border-b border-border shrink-0 space-y-1.5">
          <form onSubmit={handleSearch} className="flex gap-1.5">
            <div className="flex-1 flex items-center gap-1.5 bg-input border border-border rounded-lg px-2 py-1.5">
              <Search size={11} className="text-muted-foreground shrink-0" />
              <input
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                placeholder="Search marketplace…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-[10px]">Go</Button>
          </form>
          <div className="flex items-center gap-1.5">
            <Filter size={9} className="text-muted-foreground" />
            {["downloads","rating","newest","price-asc"].map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors",
                  sortBy === s ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                )}>
                {s === "price-asc" ? "Price ↑" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">

          {/* Browse — trending hero */}
          {tab === "browse" && trending.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <TrendingUp size={10} /> Trending
              </div>
              {trending.slice(0, 5).map(item => (
                <ItemCard key={item.id} item={item} onSelect={setSelected} purchased={purchased.has(item.id) || item.pricingModel === "free"} />
              ))}
            </div>
          )}

          {/* Browse — featured */}
          {tab === "browse" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <Crown size={10} /> Featured
              </div>
              {items.filter(i => i.featured).slice(0, 6).map(item => (
                <ItemCard key={item.id} item={item} onSelect={setSelected} purchased={purchased.has(item.id) || item.pricingModel === "free"} />
              ))}
            </div>
          )}

          {/* Type-specific or all */}
          {tab !== "browse" && (
            <div className="space-y-2">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && items.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-8">
                  {tab === "purchased" ? "No purchased items yet" : "No items found"}
                </div>
              )}
              {!loading && items.map(item => (
                <ItemCard key={item.id} item={item} onSelect={setSelected} purchased={purchased.has(item.id) || item.pricingModel === "free"} />
              ))}
            </div>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}
