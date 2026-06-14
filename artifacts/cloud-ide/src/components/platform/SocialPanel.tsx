import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePlatform } from "../../hooks/use-platform";
import {
  Users, Globe, MessageSquare, Heart, Star, GitFork, Share2,
  UserPlus, UserMinus, Search, Send, Hash, Rss, Trophy,
  Zap, Code2, Plus, ChevronRight, Check, Loader2, AlertCircle,
  ArrowUp, Eye, BookOpen, RefreshCw, Link2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SocialProfile {
  userId: string; username: string; displayName: string; bio: string;
  avatarUrl: string; skills: string[]; languages: string[]; badges: string[];
  followers: string[]; following: string[]; isPublic: boolean;
  totalProjects: number; totalDeployments: number; joinedAt: string;
}
interface ActivityItem {
  id: string; type: string; userId: string; username: string;
  payload: Record<string, unknown>; timestamp: string;
}
interface Hub {
  id: string; name: string; slug: string; description: string;
  icon: string; memberCount: number; postCount: number; isMember: boolean; topic: string;
}
interface Post {
  id: string; hubId: string; hubName: string; authorId: string; authorName: string;
  title: string; body: string; codeSnippet?: string; language?: string;
  tags: string[]; reactions: Record<string, string[]>; comments: PostComment[];
  views: number; isPinned: boolean; createdAt: string;
}
interface PostComment {
  id: string; authorId: string; authorName: string; content: string; createdAt: string;
}
interface ChatMessage {
  id: string; roomId: string; userId: string; username: string;
  content: string; type: "text" | "code" | "system"; language?: string; createdAt: string;
}
interface CollabSession {
  id: string; name: string; ownerName: string; projectPath: string;
  participantCount: number; isPublic: boolean; inviteCode?: string;
  createdAt: string; lastActivity: string;
}

type Tab = "feed" | "community" | "collab" | "chat" | "profile";

const BADGE_ICONS: Record<string, string> = {
  newcomer: "🌱", contributor: "⭐", prolific: "🔥", collaborator: "🤝",
  deployer: "🚀", ai_user: "🤖", streaker: "📅", open_source: "💚",
};

const ACTIVITY_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  commit:         { icon: <Code2 size={11} />,    color: "text-blue-400" },
  deploy:         { icon: <Zap size={11} />,       color: "text-green-400" },
  achievement:    { icon: <Trophy size={11} />,    color: "text-yellow-400" },
  streak:         { icon: <Rss size={11} />,       color: "text-orange-400" },
  follow:         { icon: <UserPlus size={11} />,  color: "text-purple-400" },
  fork:           { icon: <GitFork size={11} />,   color: "text-cyan-400" },
  star:           { icon: <Star size={11} />,      color: "text-yellow-400" },
  comment:        { icon: <MessageSquare size={11} />, color: "text-zinc-400" },
  project_create: { icon: <Plus size={11} />,      color: "text-emerald-400" },
  snippet_share:  { icon: <Share2 size={11} />,    color: "text-pink-400" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function api<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(e.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

function RelTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  const label = d > 0 ? `${d}d` : h > 0 ? `${h}h` : m > 0 ? `${m}m` : "now";
  return <span className="text-zinc-600 text-[10px]">{label}</span>;
}

function Avatar({ name, url, size = 28 }: { name: string; url?: string; size?: number }) {
  const initials = name.slice(0, 2).toUpperCase();
  const colors = ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500", "bg-pink-500"];
  const color = colors[name.charCodeAt(0) % colors.length];
  if (url) return <img src={url} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />;
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.35 }} className={`${color} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>
      {initials}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SocialPanel() {
  const { token, user } = usePlatform();
  const [tab, setTab] = useState<Tab>("feed");
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Feed
  const [feedItems, setFeedItems] = useState<ActivityItem[]>([]);
  // Community
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [activeHub, setActiveHub] = useState<Hub | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostBody, setNewPostBody] = useState("");
  const [newPostCode, setNewPostCode] = useState("");
  const [showNewPost, setShowNewPost] = useState(false);
  // Collab
  const [sessions, setSessions] = useState<CollabSession[]>([]);
  const [newSessionName, setNewSessionName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  // Chat
  const [chatRoom, setChatRoom] = useState("general");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Profile
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [editBio, setEditBio] = useState("");
  const [editSkills, setEditSkills] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SocialProfile[]>([]);

  const notify = (msg: string, type: "ok" | "err" = "ok") => {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), 4000);
  };

  // ── Load data on tab change ─────────────────────────────────────────────────

  useEffect(() => {
    if (tab === "feed") loadFeed();
    else if (tab === "community") loadHubs();
    else if (tab === "collab") loadSessions();
    else if (tab === "chat") loadChat(chatRoom);
    else if (tab === "profile") loadProfile();
  }, [tab]); // eslint-disable-line

  const loadFeed = async () => {
    setLoading(true);
    try {
      const d = await api<{ items: ActivityItem[] }>("GET", "/social/feed?limit=50", token);
      setFeedItems(d.items);
    } catch { /* empty feed is fine */ }
    finally { setLoading(false); }
  };

  const loadHubs = async () => {
    try {
      const d = await api<{ hubs: Hub[] }>("GET", "/community/hubs", token);
      setHubs(d.hubs);
    } catch { notify("Failed to load hubs", "err"); }
  };

  const loadPosts = async (hub: Hub) => {
    try {
      const d = await api<{ posts: Post[] }>("GET", `/community/hubs/${hub.id}/posts`, token);
      setPosts(d.posts);
    } catch { notify("Failed to load posts", "err"); }
  };

  const loadSessions = async () => {
    try {
      const d = await api<{ sessions: CollabSession[] }>("GET", "/collab/sessions/active", token);
      setSessions(d.sessions);
    } catch { notify("Failed to load sessions", "err"); }
  };

  const loadChat = useCallback(async (room: string) => {
    if (!token) return;
    try {
      const d = await api<{ messages: ChatMessage[] }>("GET", `/chat/history/${encodeURIComponent(room)}?limit=80`, token);
      setChatMessages(d.messages);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch { /* no messages yet */ }
  }, [token]);

  const loadProfile = async () => {
    if (!token) return;
    try {
      const d = await api<{ profile: SocialProfile }>("GET", "/social/profile", token);
      setProfile(d.profile);
      setEditBio(d.profile.bio);
      setEditSkills(d.profile.skills.join(", "));
    } catch { notify("Failed to load profile", "err"); }
  };

  // ── Feed ───────────────────────────────────────────────────────────────────

  const renderActivityIcon = (type: string) => {
    const meta = ACTIVITY_ICONS[type] ?? { icon: <Rss size={11} />, color: "text-zinc-500" };
    return <span className={meta.color}>{meta.icon}</span>;
  };

  const describeActivity = (item: ActivityItem): string => {
    const p = item.payload;
    switch (item.type) {
      case "commit": return `committed to ${String(p.repo ?? "a project")}`;
      case "deploy": return `deployed ${String(p.name ?? "a project")}`;
      case "achievement": return `earned "${String(p.title ?? "an achievement")}"`;
      case "streak": return `reached a ${String(p.days ?? "")} day streak`;
      case "follow": return `followed ${String(p.targetUsername ?? "someone")}`;
      case "fork": return `forked ${String(p.originalName ?? "a project")}`;
      case "star": return `starred ${String(p.projectName ?? "a project")}`;
      case "comment": return `commented on ${String(p.projectName ?? "a project")}`;
      case "project_create": return `published project "${String(p.name ?? "")}"`;
      case "snippet_share": return `shared a code snippet`;
      default: return `did something`;
    }
  };

  // ── Community ──────────────────────────────────────────────────────────────

  const toggleHub = async (hub: Hub) => {
    if (!token) return;
    try {
      const d = await api<{ joined: boolean; memberCount: number }>(
        "POST", `/community/hubs/join/${hub.id}`, token
      );
      setHubs(prev => prev.map(h => h.id === hub.id
        ? { ...h, isMember: d.joined, memberCount: d.memberCount } : h));
    } catch (e: unknown) { notify(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const openHub = async (hub: Hub) => {
    setActiveHub(hub);
    await loadPosts(hub);
  };

  const submitPost = async () => {
    if (!activeHub || !token || !newPostTitle.trim() || !newPostBody.trim()) return;
    try {
      await api("POST", "/community/post", token, {
        hubId: activeHub.id, title: newPostTitle, body: newPostBody,
        codeSnippet: newPostCode || undefined,
      });
      notify("Post published!");
      setNewPostTitle(""); setNewPostBody(""); setNewPostCode(""); setShowNewPost(false);
      await loadPosts(activeHub);
    } catch (e: unknown) { notify(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const reactPost = async (postId: string, emoji: string) => {
    if (!token) return;
    try {
      const d = await api<{ reactions: Record<string, string[]> }>(
        "POST", `/community/post/${postId}/react`, token, { emoji }
      );
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions: d.reactions } : p));
    } catch { /* ignore */ }
  };

  // ── Collab ─────────────────────────────────────────────────────────────────

  const createSession = async () => {
    if (!token || !newSessionName.trim()) return;
    setLoading(true);
    try {
      const d = await api<{ session: CollabSession }>("POST", "/collab/session/create", token,
        { name: newSessionName, isPublic: true });
      notify(`Session created! Code: ${d.session.inviteCode}`);
      setNewSessionName("");
      await loadSessions();
    } catch (e: unknown) { notify(e instanceof Error ? e.message : "Failed", "err"); }
    finally { setLoading(false); }
  };

  const joinSession = async () => {
    if (!token || !joinCode.trim()) return;
    try {
      await api("POST", `/collab/session/join/${joinCode.trim()}`, token, {});
      notify("Joined session!");
      setJoinCode("");
      await loadSessions();
    } catch (e: unknown) { notify(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const leaveSession = async (id: string) => {
    if (!token) return;
    try {
      await api("DELETE", `/collab/session/leave/${id}`, token);
      notify("Left session");
      await loadSessions();
    } catch { /* ignore */ }
  };

  // ── Chat ──────────────────────────────────────────────────────────────────

  const sendChat = async () => {
    if (!token || !chatInput.trim()) return;
    const content = chatInput.trim();
    setChatInput("");
    try {
      await api("POST", "/chat/send", token, { roomId: chatRoom, content });
      await loadChat(chatRoom);
    } catch (e: unknown) { notify(e instanceof Error ? e.message : "Send failed", "err"); }
  };

  // ── Profile ────────────────────────────────────────────────────────────────

  const saveProfile = async () => {
    if (!token) return;
    try {
      await api("PUT", "/social/profile/update", token, {
        bio: editBio,
        skills: editSkills.split(",").map(s => s.trim()).filter(Boolean),
      });
      notify("Profile updated");
      await loadProfile();
    } catch (e: unknown) { notify(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const searchUsers = async () => {
    if (!searchQ.trim()) return;
    try {
      const d = await api<{ users: SocialProfile[] }>("GET", `/social/search?q=${encodeURIComponent(searchQ)}`, token);
      setSearchResults(d.users);
    } catch { notify("Search failed", "err"); }
  };

  const followUser = async (targetUserId: string) => {
    if (!token) return;
    try {
      await api("POST", "/social/follow", token, { targetUserId });
      notify("Followed!");
      await loadProfile();
    } catch (e: unknown) { notify(e instanceof Error ? e.message : "Failed", "err"); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "feed",      label: "Feed",      icon: <Rss size={12} /> },
    { id: "community", label: "Community", icon: <Hash size={12} /> },
    { id: "collab",    label: "Collab",    icon: <Users size={12} /> },
    { id: "chat",      label: "Chat",      icon: <MessageSquare size={12} /> },
    { id: "profile",   label: "Profile",   icon: <Globe size={12} /> },
  ];

  return (
    <div className="flex flex-col h-full text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-zinc-300" />
          <span className="text-sm font-semibold">Social</span>
        </div>
        <button onClick={() => { if (tab === "feed") loadFeed(); else if (tab === "chat") loadChat(chatRoom); }}
          className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`mx-4 mt-2 px-3 py-2 rounded text-xs flex items-center gap-2
          ${flash.type === "err" ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-green-500/10 border border-green-500/20 text-green-400"}`}>
          {flash.type === "err" ? <AlertCircle size={12} /> : <Check size={12} />} {flash.msg}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 px-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1 px-2.5 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap
              ${tab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── FEED ──────────────────────────────────────────────────────────── */}
        {tab === "feed" && (
          <div className="p-4 space-y-1">
            {loading && feedItems.length === 0 && (
              <div className="flex items-center justify-center py-8 text-zinc-500">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading…
              </div>
            )}
            {!loading && feedItems.length === 0 && (
              <div className="text-center py-10 text-zinc-600 text-xs">
                <Rss size={24} className="mx-auto mb-2 opacity-30" />
                No activity yet. Start coding, deploying, or collaborating!
              </div>
            )}
            {feedItems.map(item => (
              <div key={item.id} className="flex items-start gap-2.5 py-2.5 border-b border-zinc-800/40 last:border-0">
                <div className="mt-0.5 w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-[10px] font-bold text-zinc-400">
                  {item.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-zinc-200">{item.username}</span>
                    {renderActivityIcon(item.type)}
                    <span className="text-xs text-zinc-400">{describeActivity(item)}</span>
                    <RelTime iso={item.timestamp} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── COMMUNITY ─────────────────────────────────────────────────────── */}
        {tab === "community" && (
          <div className="p-4">
            {!activeHub ? (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 mb-3">Join hubs to connect with developers</p>
                {hubs.map(hub => (
                  <div key={hub.id} className="flex items-center gap-3 p-3 bg-zinc-800/40 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors">
                    <span className="text-2xl">{hub.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-100">{hub.name}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{hub.description}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-600">
                        <span><Users size={9} className="inline mr-0.5" />{hub.memberCount}</span>
                        <span><BookOpen size={9} className="inline mr-0.5" />{hub.postCount}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => openHub(hub)}
                        className="text-[11px] px-2.5 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors">
                        Browse
                      </button>
                      <button onClick={() => toggleHub(hub)}
                        className={`text-[11px] px-2.5 py-1 rounded border transition-colors
                          ${hub.isMember ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-zinc-600 text-zinc-400 hover:border-zinc-500"}`}>
                        {hub.isMember ? <><Check size={10} className="inline" /> Joined</> : "Join"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Hub header */}
                <div className="flex items-center gap-2">
                  <button onClick={() => { setActiveHub(null); setPosts([]); }}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors text-xs">← Back</button>
                  <span className="text-xl">{activeHub.icon}</span>
                  <span className="text-sm font-semibold">{activeHub.name}</span>
                </div>

                {/* New post toggle */}
                <button onClick={() => setShowNewPost(v => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-800/40 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-zinc-300 hover:border-zinc-600 transition-colors">
                  <Plus size={13} /> Write a post…
                </button>

                {showNewPost && (
                  <div className="space-y-2 p-3 bg-zinc-800/40 border border-zinc-700 rounded-lg">
                    <input value={newPostTitle} onChange={e => setNewPostTitle(e.target.value)}
                      placeholder="Title"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
                    <textarea value={newPostBody} onChange={e => setNewPostBody(e.target.value)}
                      placeholder="What's on your mind? Ask a question, share a tip, showcase your work…"
                      rows={4}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none" />
                    <textarea value={newPostCode} onChange={e => setNewPostCode(e.target.value)}
                      placeholder="Code snippet (optional)"
                      rows={3}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none" />
                    <div className="flex gap-2">
                      <button onClick={submitPost}
                        className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium transition-colors">
                        Publish
                      </button>
                      <button onClick={() => setShowNewPost(false)}
                        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Posts */}
                {posts.length === 0 && (
                  <p className="text-center text-xs text-zinc-600 py-6">No posts yet. Be the first!</p>
                )}
                {posts.map(post => (
                  <div key={post.id} className="p-3 bg-zinc-800/40 border border-zinc-700 rounded-lg space-y-2">
                    {post.isPinned && <span className="text-[10px] text-yellow-400">📌 Pinned</span>}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-zinc-100 leading-snug">{post.title}</p>
                      <div className="flex items-center gap-1 text-[10px] text-zinc-600 shrink-0">
                        <Eye size={9} /> {post.views}
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{post.body.slice(0, 300)}{post.body.length > 300 ? "…" : ""}</p>
                    {post.codeSnippet && (
                      <pre className="bg-zinc-900 rounded p-2 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-24">
                        {post.codeSnippet.slice(0, 300)}
                      </pre>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {["❤️", "👍", "🔥", "💡"].map(emoji => {
                          const count = post.reactions[emoji]?.length ?? 0;
                          return (
                            <button key={emoji} onClick={() => reactPost(post.id, emoji)}
                              className={`flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded transition-colors
                                ${count > 0 ? "bg-zinc-700 text-zinc-200" : "text-zinc-600 hover:text-zinc-400"}`}>
                              {emoji}{count > 0 && <span>{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                        <span>{post.authorName}</span>
                        <span><MessageSquare size={9} className="inline mr-0.5" />{post.comments.length}</span>
                        <RelTime iso={post.createdAt} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── COLLAB ────────────────────────────────────────────────────────── */}
        {tab === "collab" && (
          <div className="p-4 space-y-4">
            {/* Create session */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">Start a session</p>
              <div className="flex gap-2">
                <input value={newSessionName} onChange={e => setNewSessionName(e.target.value)}
                  placeholder="Session name…"
                  onKeyDown={e => e.key === "Enter" && createSession()}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
                <button onClick={createSession} disabled={loading || !newSessionName.trim()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-colors flex items-center gap-1">
                  {loading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create
                </button>
              </div>
            </div>

            {/* Join session */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">Join with invite code</p>
              <div className="flex gap-2">
                <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="XXXXXXXX"
                  maxLength={8}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
                <button onClick={joinSession} disabled={joinCode.length < 6}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-colors">
                  Join
                </button>
              </div>
            </div>

            {/* Active sessions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-zinc-400">Active sessions</p>
                <button onClick={loadSessions} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                  <RefreshCw size={11} />
                </button>
              </div>
              {sessions.length === 0 && (
                <p className="text-xs text-zinc-600 py-4 text-center">No active sessions. Start one above!</p>
              )}
              {sessions.map(s => (
                <div key={s.id} className="flex items-start gap-3 p-3 bg-zinc-800/40 border border-zinc-700 rounded-lg mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                      <p className="text-xs font-semibold text-zinc-100 truncate">{s.name}</p>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">by {s.ownerName} · {s.participantCount} online</p>
                    {s.inviteCode && (
                      <div className="flex items-center gap-1 mt-1">
                        <Link2 size={10} className="text-zinc-600" />
                        <code className="text-[11px] text-blue-400 font-mono">{s.inviteCode}</code>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => leaveSession(s.id)}
                      className="text-[11px] px-2.5 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors">
                      Leave
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CHAT ──────────────────────────────────────────────────────────── */}
        {tab === "chat" && (
          <div className="flex flex-col h-full" style={{ height: "calc(100% - 0px)" }}>
            {/* Room selector */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-zinc-800 flex-shrink-0">
              {["general", "random", "code-review", "deployments"].map(room => (
                <button key={room} onClick={() => { setChatRoom(room); loadChat(room); }}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors
                    ${chatRoom === room ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                  #{room}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 0 }}>
              {chatMessages.length === 0 && (
                <p className="text-center text-xs text-zinc-600 py-4">No messages yet. Say hello!</p>
              )}
              {chatMessages.map((msg, i) => {
                const isOwn = msg.userId === (user as { id?: string } | null)?.id;
                const showName = i === 0 || chatMessages[i - 1].userId !== msg.userId;
                return (
                  <div key={msg.id} className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                    {showName && !isOwn && (
                      <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-400 shrink-0 mt-0.5">
                        {msg.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    {(!showName || isOwn) && <div className="w-6 shrink-0" />}
                    <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {showName && !isOwn && <span className="text-[10px] text-zinc-500 ml-0.5">{msg.username}</span>}
                      {msg.type === "code" ? (
                        <pre className={`bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-[11px] font-mono text-zinc-200 max-w-full overflow-x-auto`}>
                          {msg.content}
                        </pre>
                      ) : (
                        <div className={`px-3 py-1.5 rounded-2xl text-xs leading-relaxed
                          ${isOwn ? "bg-blue-600 text-white rounded-tr-sm" : "bg-zinc-800 text-zinc-200 rounded-tl-sm"}`}>
                          {msg.content}
                        </div>
                      )}
                      <RelTime iso={msg.createdAt} />
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 p-3 border-t border-zinc-800 flex-shrink-0">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat())}
                placeholder={`Message #${chatRoom}`}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
              <button onClick={sendChat} disabled={!chatInput.trim()}
                className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 flex items-center justify-center transition-colors">
                <Send size={13} className="text-white" />
              </button>
            </div>
          </div>
        )}

        {/* ── PROFILE ───────────────────────────────────────────────────────── */}
        {tab === "profile" && (
          <div className="p-4 space-y-4">
            {profile && (
              <div className="space-y-3">
                {/* My profile */}
                <div className="p-3 bg-zinc-800/40 border border-zinc-700 rounded-lg space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white shrink-0">
                      {profile.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{profile.displayName || profile.username}</p>
                      <p className="text-[11px] text-zinc-500">
                        {profile.followers.length} followers · {profile.following.length} following
                      </p>
                    </div>
                  </div>

                  {/* Badges */}
                  {profile.badges.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {profile.badges.map(b => (
                        <span key={b} className="flex items-center gap-1 text-[11px] bg-zinc-700 px-2 py-0.5 rounded-full text-zinc-300">
                          {BADGE_ICONS[b] ?? "🏅"} {b}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Edit bio */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-500">Bio</label>
                    <textarea value={editBio} onChange={e => setEditBio(e.target.value)}
                      rows={2} placeholder="Tell others about yourself…"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-500">Skills (comma-separated)</label>
                    <input value={editSkills} onChange={e => setEditSkills(e.target.value)}
                      placeholder="React, TypeScript, Python…"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
                  </div>
                  <button onClick={saveProfile}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium transition-colors">
                    Save Profile
                  </button>
                </div>

                {/* Skill tags */}
                {profile.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.skills.map(s => (
                      <span key={s} className="text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Search users */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">Find developers</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && searchUsers()}
                    placeholder="Search by name or skill…"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
                </div>
                <button onClick={searchUsers}
                  className="px-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-lg transition-colors">
                  Go
                </button>
              </div>
              {searchResults.map(u => (
                <div key={u.userId} className="flex items-center gap-2.5 p-2.5 bg-zinc-800/40 border border-zinc-700 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                    {u.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-zinc-200">{u.displayName || u.username}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{u.bio || u.skills.join(", ")}</p>
                  </div>
                  <button onClick={() => followUser(u.userId)}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-zinc-600 text-zinc-400 hover:border-blue-500 hover:text-blue-400 transition-colors">
                    <UserPlus size={11} /> Follow
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
