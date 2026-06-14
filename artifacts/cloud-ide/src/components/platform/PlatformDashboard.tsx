import React, { useState } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { BillingPanel } from "./BillingPanel";
import { TeamsPanel } from "./TeamsPanel";
import { PluginMarketplace } from "./PluginMarketplace";
import { AgentMarketplace } from "./AgentMarketplace";
import { NodeDashboard } from "./NodeDashboard";
import { ContainerBuilder } from "./ContainerBuilder";
import { Button } from "../ui/button";
import {
  X, CreditCard, Users, Puzzle, BrainCircuit, Server, Container,
} from "lucide-react";

type Tab = "billing" | "teams" | "plugins" | "agents" | "nodes" | "containers";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "billing", label: "Billing", icon: <CreditCard size={14} /> },
  { id: "teams", label: "Teams", icon: <Users size={14} /> },
  { id: "plugins", label: "Plugins", icon: <Puzzle size={14} /> },
  { id: "agents", label: "Agents", icon: <BrainCircuit size={14} /> },
  { id: "nodes", label: "Nodes", icon: <Server size={14} /> },
  { id: "containers", label: "Container", icon: <Container size={14} /> },
];

interface PlatformDashboardProps {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
}

export function PlatformDashboard({ open, onClose, initialTab = "billing" }: PlatformDashboardProps) {
  const { user } = usePlatform();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — slides in from right */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 flex flex-col bg-card border-l border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <div className="text-sm font-bold text-foreground">Platform</div>
            {user && <div className="text-[10px] text-muted-foreground">{user.username}</div>}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-border shrink-0 bg-background/50">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center px-3 py-2 text-[10px] font-semibold whitespace-nowrap transition-colors shrink-0 border-b-2 ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              <span className="mt-0.5">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {activeTab === "billing" && <BillingPanel />}
          {activeTab === "teams" && <TeamsPanel />}
          {activeTab === "plugins" && <PluginMarketplace />}
          {activeTab === "agents" && <AgentMarketplace />}
          {activeTab === "nodes" && <NodeDashboard />}
          {activeTab === "containers" && <ContainerBuilder />}
        </div>
      </div>
    </>
  );
}
