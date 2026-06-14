import React, { useState, useEffect } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Loader2, Plus, Users, Crown, Shield, Eye, UserMinus, Trash2, Activity, ChevronRight, ArrowLeft } from "lucide-react";

interface TeamMember { userId: string; username: string; role: string; joinedAt: string; }
interface ActivityEvent { id: string; userId: string; username: string; action: string; resource: string; timestamp: string; }
interface Team { id: string; name: string; description: string; ownerId: string; members: TeamMember[]; activity: ActivityEvent[]; projectIds: string[]; createdAt: string; }

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown size={11} className="text-amber-400" />,
  admin: <Shield size={11} className="text-blue-400" />,
  member: <Users size={11} className="text-muted-foreground" />,
  viewer: <Eye size={11} className="text-muted-foreground" />,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  admin: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  member: "bg-muted text-muted-foreground",
  viewer: "bg-muted text-muted-foreground/60",
};

export function TeamsPanel() {
  const { token, user } = usePlatform();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<"list" | "team" | "create">("list");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [inviteId, setInviteId] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState("");

  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadTeams = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await fetch("/api/teams", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setTeams(Array.isArray(data) ? data : []);
    } finally { setIsLoading(false); }
  };

  const loadTeam = async (id: string) => {
    const data = await fetch(`/api/teams/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setSelectedTeam(data);
  };

  useEffect(() => { loadTeams(); }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true); setError("");
    try {
      const t = await fetch("/api/teams", { method: "POST", headers: auth, body: JSON.stringify({ name: newName, description: newDesc }) }).then(r => r.json());
      if (t.error) throw new Error(t.error);
      await loadTeams();
      setNewName(""); setNewDesc(""); setView("list");
    } catch (err: any) { setError(err.message); }
    finally { setIsCreating(false); }
  };

  const handleDelete = async (teamId: string) => {
    if (!confirm("Delete this team?")) return;
    await fetch(`/api/teams/${teamId}`, { method: "DELETE", headers: auth });
    setView("list"); setSelectedTeam(null); loadTeams();
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteId.trim() || !selectedTeam) return;
    setIsInviting(true); setError("");
    try {
      const r = await fetch(`/api/teams/${selectedTeam.id}/invite`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ inviteeId: inviteId, role: inviteRole }),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      await loadTeam(selectedTeam.id);
      setInviteId("");
    } catch (err: any) { setError(err.message); }
    finally { setIsInviting(false); }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedTeam) return;
    await fetch(`/api/teams/${selectedTeam.id}/members/${memberId}`, { method: "DELETE", headers: auth });
    await loadTeam(selectedTeam.id);
  };

  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (view === "create") return (
    <div className="flex-1 p-4">
      <button onClick={() => setView("list")} className="flex items-center text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={12} className="mr-1" /> Back
      </button>
      <div className="text-sm font-semibold mb-4">Create Team</div>
      <form onSubmit={handleCreate} className="space-y-3">
        <Input placeholder="Team name" value={newName} onChange={e => setNewName(e.target.value)} className="h-8 text-sm bg-background border-border" required />
        <Input placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} className="h-8 text-sm bg-background border-border" />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Button type="submit" size="sm" disabled={isCreating} className="w-full h-8 text-xs">
          {isCreating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Create Team
        </Button>
      </form>
    </div>
  );

  if (view === "team" && selectedTeam) return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border">
        <button onClick={() => { setView("list"); loadTeams(); }} className="flex items-center text-xs text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft size={12} className="mr-1" /> All Teams
        </button>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{selectedTeam.name}</div>
            {selectedTeam.description && <div className="text-[11px] text-muted-foreground">{selectedTeam.description}</div>}
          </div>
          {selectedTeam.ownerId === user?.id && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-900/20" onClick={() => handleDelete(selectedTeam.id)}>
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Members */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Members ({selectedTeam.members.length})
          </div>
          <div className="space-y-1.5">
            {selectedTeam.members.map(m => (
              <div key={m.userId} className="flex items-center justify-between p-2 rounded-md bg-background border border-border">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{m.username}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(m.joinedAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${ROLE_COLORS[m.role] ?? ""}`}>
                    <span className="flex items-center space-x-1">{ROLE_ICONS[m.role]}<span>{m.role}</span></span>
                  </Badge>
                  {m.userId !== user?.id && m.userId !== selectedTeam.ownerId && (
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-400" onClick={() => handleRemoveMember(m.userId)}>
                      <UserMinus size={11} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invite */}
        {(selectedTeam.ownerId === user?.id || selectedTeam.members.find(m => m.userId === user?.id)?.role === "admin") && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Invite Member</div>
            <form onSubmit={handleInvite} className="space-y-2">
              <Input placeholder="User ID" value={inviteId} onChange={e => setInviteId(e.target.value)} className="h-7 text-xs bg-background border-border" />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="w-full h-7 text-xs bg-background border border-border rounded-md px-2 text-foreground">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <Button type="submit" size="sm" disabled={isInviting} className="w-full h-7 text-xs">
                {isInviting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Invite
              </Button>
            </form>
          </div>
        )}

        {/* Activity */}
        <div>
          <div className="flex items-center space-x-1.5 mb-2">
            <Activity size={11} className="text-muted-foreground" />
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</div>
          </div>
          <div className="space-y-1.5">
            {selectedTeam.activity.slice(0, 10).map(ev => (
              <div key={ev.id} className="text-[11px] text-muted-foreground">
                <span className="text-foreground font-medium">{ev.username}</span> {ev.action}
                {ev.resource && <span className="text-primary/80"> {ev.resource}</span>}
                <span className="text-muted-foreground/50 ml-1">{new Date(ev.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
            {selectedTeam.activity.length === 0 && <p className="text-xs text-muted-foreground italic">No activity yet</p>}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Teams</div>
        <Button size="sm" className="h-7 text-xs" onClick={() => { setView("create"); setError(""); }}>
          <Plus size={12} className="mr-1" /> New
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {teams.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No teams yet</p>
            <Button size="sm" className="mt-3 h-7 text-xs" onClick={() => setView("create")}>Create your first team</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {teams.map(t => (
              <button key={t.id} onClick={async () => { await loadTeam(t.id); setView("team"); }}
                className="w-full text-left p-3 rounded-lg border border-border bg-background hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{t.name}</div>
                    <div className="text-[11px] text-muted-foreground">{t.members.length} members</div>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
