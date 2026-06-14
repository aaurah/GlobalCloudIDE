import React, { useState } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Loader2, Terminal, Fingerprint, KeyRound, Plus } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Detect passkey support
const passkeySupported =
  typeof window !== "undefined" &&
  typeof window.PublicKeyCredential !== "undefined" &&
  typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function";

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { login, register, loginWithPasskey, registerPasskey, isAuthLoading, user } = usePlatform();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState(""); // email or username for login
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passkeyDeviceName, setPasskeyDeviceName] = useState("");
  const [showAddPasskey, setShowAddPasskey] = useState(false);

  const clearMessages = () => { setError(""); setSuccess(""); };

  // ── Password submit ────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    try {
      if (tab === "login") {
        await login(identifier, password);
      } else {
        await register(username, email, password);
      }
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── Passkey login ──────────────────────────────────────────────────────────

  const handlePasskeyLogin = async () => {
    clearMessages();
    try {
      await loginWithPasskey(identifier || undefined);
      onOpenChange(false);
    } catch (err: any) {
      // User cancelled = abort error, don't show as error
      if (err.name === "AbortError" || err.message?.includes("cancelled") || err.message?.includes("abort")) return;
      setError(err.message);
    }
  };

  // ── Add passkey (for logged-in users) ────────────────────────────────────

  const handleAddPasskey = async () => {
    clearMessages();
    try {
      await registerPasskey(passkeyDeviceName || "My Device");
      setSuccess("Passkey added successfully!");
      setShowAddPasskey(false);
      setPasskeyDeviceName("");
    } catch (err: any) {
      if (err.name === "AbortError" || err.message?.includes("cancelled")) return;
      setError(err.message);
    }
  };

  // ── If already logged in, show passkey management ─────────────────────────

  if (user && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px] bg-card border-border p-0 overflow-hidden">
          <div className="p-6 space-y-4">
            <DialogHeader>
              <div className="flex items-center space-x-2 mb-1">
                <Terminal className="h-5 w-5 text-primary" />
                <DialogTitle className="text-base font-bold">CloudIDE Platform</DialogTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                Signed in as <span className="font-semibold text-foreground">{user.username}</span>
              </p>
            </DialogHeader>

            <div className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Fingerprint size={15} className="text-primary" />
                Passkeys
                {user.passkeyCount !== undefined && (
                  <span className="ml-auto text-xs text-muted-foreground font-normal">{user.passkeyCount} registered</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Add a passkey to sign in with Face ID, Touch ID, or your device PIN — no password needed.
              </p>
              {passkeySupported ? (
                showAddPasskey ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Device name (e.g. iPhone 15)"
                      value={passkeyDeviceName}
                      onChange={e => setPasskeyDeviceName(e.target.value)}
                      className="h-8 text-xs bg-background border-border"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => { setShowAddPasskey(false); clearMessages(); }}>
                        Cancel
                      </Button>
                      <Button size="sm" className="flex-1 h-8 text-xs" disabled={isAuthLoading} onClick={handleAddPasskey}>
                        {isAuthLoading ? <Loader2 size={12} className="animate-spin" /> : "Register Passkey"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5" onClick={() => setShowAddPasskey(true)}>
                    <Plus size={12} />Add Passkey for This Device
                  </Button>
                )
              ) : (
                <p className="text-xs text-amber-400">Passkeys not supported on this device/browser.</p>
              )}
            </div>

            {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-md p-2">{error}</p>}
            {success && <p className="text-xs text-green-400 bg-green-900/20 border border-green-900/30 rounded-md p-2">{success}</p>}

            <Button variant="outline" className="w-full h-9 text-sm" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Sign-in / Register modal ───────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-card border-border p-0 overflow-hidden">
        <div className="p-6">
          <DialogHeader className="mb-5">
            <div className="flex items-center space-x-2 mb-1">
              <Terminal className="h-5 w-5 text-primary" />
              <DialogTitle className="text-base font-bold">CloudIDE Platform</DialogTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              Sign in to manage projects, deploy apps, and access cloud features.
            </p>
          </DialogHeader>

          {/* Tab switcher */}
          <div className="flex border border-border rounded-md p-1 bg-background mb-5">
            {(["login", "register"] as const).map(t => (
              <button key={t}
                onClick={() => { setTab(t); clearMessages(); }}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-sm transition-colors ${
                  tab === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {t === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col space-y-3">
            {tab === "register" && (
              <Input
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="h-9 text-sm bg-background border-border"
                required
                autoComplete="username"
              />
            )}

            {tab === "register" ? (
              <Input
                type="email"
                placeholder="Email (optional)"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-9 text-sm bg-background border-border"
                autoComplete="email"
              />
            ) : (
              <Input
                placeholder="Email or Username"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                className="h-9 text-sm bg-background border-border"
                required
                autoComplete="username email"
              />
            )}

            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-9 text-sm bg-background border-border"
              required
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              minLength={tab === "register" ? 6 : undefined}
            />

            {error && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-md p-2">
                {error}
              </p>
            )}

            <Button type="submit" disabled={isAuthLoading} className="w-full h-9 text-sm font-semibold">
              {isAuthLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : tab === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          {/* Passkey section */}
          {passkeySupported && (
            <div className="mt-4">
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-muted-foreground px-1">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-9 text-sm font-semibold gap-2 border-primary/40 hover:border-primary"
                disabled={isAuthLoading}
                onClick={handlePasskeyLogin}
              >
                {isAuthLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <>
                      <Fingerprint className="w-4 h-4 text-primary" />
                      Sign in with Passkey
                    </>
                }
              </Button>

              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Use Face ID, Touch ID, or your device PIN
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
