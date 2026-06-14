import React, { useEffect } from "react";
import { AiPanel } from "../panel/AiPanel";
import { X } from "lucide-react";
import { Button } from "../ui/button";

interface MobileAiSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MobileAiSheet({ open, onClose }: MobileAiSheetProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        className={`fixed inset-x-0 bottom-0 top-14 z-50 flex flex-col bg-card border-t border-border shadow-2xl rounded-t-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 h-11 border-b border-border shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
          <span className="text-xs font-semibold">AI Assistant</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <AiPanel isVisible={true} />
        </div>
      </div>
    </>
  );
}
