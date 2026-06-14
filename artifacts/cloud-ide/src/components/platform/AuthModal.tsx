import React, { useState } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Loader2, Terminal } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { login, register, isAuthLoading } = usePlatform();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (tab === "login") {
        await login(email, password);
      } else {
        await register(username, email, password);
      }
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-card border-border p-0 overflow-hidden">
        <div className="p-6">
          <DialogHeader className="mb-6">
            <div className="flex items-center space-x-2 mb-1">
              <Terminal className="h-5 w-5 text-primary" />
              <DialogTitle className="text-base font-bold">CloudIDE Platform</DialogTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              Sign in to manage projects, deploy apps, and access cloud features.
            </p>
          </DialogHeader>

          <div className="flex border border-border rounded-md p-1 bg-background mb-5">
            <button
              onClick={() => { setTab("login"); setError(""); }}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-sm transition-colors ${
                tab === "login" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab("register"); setError(""); }}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-sm transition-colors ${
                tab === "register" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col space-y-3">
            {tab === "register" && (
              <Input
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="h-9 text-sm bg-background border-border"
                required
              />
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-9 text-sm bg-background border-border"
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-9 text-sm bg-background border-border"
              required
            />

            {error && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-md p-2">
                {error}
              </p>
            )}

            <Button type="submit" disabled={isAuthLoading} className="w-full h-9 text-sm font-semibold mt-1">
              {isAuthLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : tab === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
