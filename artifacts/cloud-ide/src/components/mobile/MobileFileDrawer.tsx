import React, { useEffect, useRef } from "react";
import { FileExplorer } from "../sidebar/FileExplorer";
import { X } from "lucide-react";
import { Button } from "../ui/button";

interface MobileFileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileFileDrawer({ open, onClose }: MobileFileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Swipe right to close
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    let startX = 0;
    const onStart = (e: TouchEvent) => { startX = e.touches[0].clientX; };
    const onEnd = (e: TouchEvent) => {
      if (e.changedTouches[0].clientX - startX > 60) onClose();
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col bg-card border-r border-border shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-3 h-11 border-b border-border shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Explorer</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <FileExplorer onFileOpen={onClose} />
        </div>
      </div>
    </>
  );
}
