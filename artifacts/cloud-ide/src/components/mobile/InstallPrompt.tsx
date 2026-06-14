import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try { return localStorage.getItem("pwa_install_dismissed") === "1"; } catch { return false; }
  });
  const [isInstalled, setIsInstalled] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches
  );

  useEffect(() => {
    if (isInstalled || isDismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      // Delay showing the banner for better UX
      setTimeout(() => setVisible(true), 5000);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Also detect if already installed
    window.matchMedia("(display-mode: standalone)").addEventListener("change", e => {
      if (e.matches) setIsInstalled(true);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isInstalled, isDismissed]);

  const handleInstall = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
    setIsDismissed(true);
    try { localStorage.setItem("pwa_install_dismissed", "1"); } catch {}
  };

  if (!visible || isInstalled || isDismissed) return null;

  return (
    <div className="fixed bottom-16 inset-x-3 z-50 rounded-2xl border border-border bg-card shadow-2xl backdrop-blur-md overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <Smartphone size={20} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold">Install CloudIDE</div>
          <div className="text-[11px] text-muted-foreground">Add to home screen for the best experience</div>
        </div>
        <button onClick={handleDismiss} className="p-1.5 rounded-full hover:bg-muted touch-manipulation shrink-0">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <Button variant="outline" size="sm" className="flex-1 h-9 text-xs touch-manipulation" onClick={handleDismiss}>
          Not now
        </Button>
        <Button size="sm" className="flex-1 h-9 text-xs touch-manipulation flex items-center gap-1.5 bg-primary" onClick={handleInstall}>
          <Download size={13} /> Install
        </Button>
      </div>
    </div>
  );
}
