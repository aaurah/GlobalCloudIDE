import React, { useState } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { BillingPanel } from "./BillingPanel";
import { TeamsPanel } from "./TeamsPanel";
import { PluginMarketplace } from "./PluginMarketplace";
import { AgentMarketplace } from "./AgentMarketplace";
import { NodeDashboard } from "./NodeDashboard";
import { ContainerBuilder } from "./ContainerBuilder";
import { OrchestratorConsole } from "./OrchestratorConsole";
import { CloudFunctionsEditor } from "./CloudFunctionsEditor";
import { ObservabilityPanel } from "./ObservabilityPanel";
import { InfraGenerator } from "./InfraGenerator";
import { GlobalSchedulerPanel } from "./GlobalSchedulerPanel";
import { HealingDashboard } from "./HealingDashboard";
import { RoutingPanel } from "./RoutingPanel";
import { AdminPanel } from "./AdminPanel";
import { GrowthPanel } from "./GrowthPanel";
import { MarketplaceHub } from "./MarketplaceHub";
import { CreatorDashboard } from "./CreatorDashboard";
import { PlansPanel } from "./PlansPanel";
import { Button } from "../ui/button";
import { GitHubPanel } from "./GitHubPanel";
import { SocialPanel } from "./SocialPanel";
import {
  X, CreditCard, Users, Puzzle, BrainCircuit, Server, Container,
  Activity, Zap, Sparkles, Globe, ShieldCheck, Network, ShieldAlert, Gift,
  Store, PaintbrushIcon, Layers, Github, Heart,
} from "lucide-react";

type Tab =
  | "billing" | "teams" | "plugins" | "agents" | "nodes" | "containers"
  | "orchestrator" | "functions" | "observability" | "infragen"
  | "scheduler" | "healing" | "routing" | "admin" | "growth"
  | "marketplace" | "creator" | "plans" | "github" | "social";

interface TabDef { id: Tab; label: string; icon: React.ReactNode; group: "platform" | "cloud-os" }

const TABS: TabDef[] = [
  // Platform group
  { id: "billing",       label: "Billing",     icon: <CreditCard size={12} />,      group: "platform" },
  { id: "plans",         label: "Plans",       icon: <Layers size={12} />,          group: "platform" },
  { id: "marketplace",   label: "Market",      icon: <Store size={12} />,           group: "platform" },
  { id: "creator",       label: "Creator",     icon: <PaintbrushIcon size={12} />,  group: "platform" },
  { id: "teams",         label: "Teams",       icon: <Users size={12} />,           group: "platform" },
  { id: "plugins",       label: "Plugins",     icon: <Puzzle size={12} />,          group: "platform" },
  { id: "agents",        label: "Agents",      icon: <BrainCircuit size={12} />,    group: "platform" },
  { id: "nodes",         label: "Nodes",       icon: <Server size={12} />,          group: "platform" },
  { id: "containers",    label: "Container",   icon: <Container size={12} />,       group: "platform" },
  { id: "social",        label: "Social",      icon: <Heart size={12} />,           group: "platform" },
  { id: "github",        label: "GitHub",      icon: <Github size={12} />,          group: "platform" },
  { id: "growth",        label: "Growth",      icon: <Gift size={12} />,            group: "platform" },
  { id: "admin",         label: "Admin",       icon: <ShieldAlert size={12} />,     group: "platform" },
  // Cloud OS group
  { id: "orchestrator",  label: "Orchestrator",icon: <BrainCircuit size={12} />, group: "cloud-os" },
  { id: "scheduler",     label: "Scheduler",   icon: <Globe size={12} />,        group: "cloud-os" },
  { id: "healing",       label: "Healing",     icon: <ShieldCheck size={12} />,  group: "cloud-os" },
  { id: "routing",       label: "Routing",     icon: <Network size={12} />,      group: "cloud-os" },
  { id: "functions",     label: "Functions",   icon: <Zap size={12} />,          group: "cloud-os" },
  { id: "observability", label: "Observe",     icon: <Activity size={12} />,     group: "cloud-os" },
  { id: "infragen",      label: "Infra AI",    icon: <Sparkles size={12} />,     group: "cloud-os" },
];

interface PlatformDashboardProps {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
}

export function PlatformDashboard({ open, onClose, initialTab = "billing" }: PlatformDashboardProps) {
  const { user } = usePlatform();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [activeGroup, setActiveGroup] = useState<"platform" | "cloud-os">("platform");

  if (!open) return null;

  const visibleTabs = TABS.filter(t => t.group === activeGroup);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Slide-in panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 flex flex-col bg-card border-l border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 bg-background/60">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <Sparkles size={10} className="text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">Cloud OS</div>
              {user && <div className="text-[9px] text-muted-foreground">{user.username}</div>}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X size={13} />
          </Button>
        </div>

        {/* Group switcher */}
        <div className="flex border-b border-border shrink-0 bg-background/40">
          {(["platform", "cloud-os"] as const).map(group => (
            <button
              key={group}
              onClick={() => {
                setActiveGroup(group);
                const firstTab = TABS.find(t => t.group === group);
                if (firstTab) setActiveTab(firstTab.id);
              }}
              className={`flex-1 py-2 text-[11px] font-semibold transition-colors border-b-2 ${
                activeGroup === group
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {group === "platform" ? "Platform" : "Cloud OS"}
            </button>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-border shrink-0 bg-background/30 scrollbar-hide">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center px-2.5 py-1.5 text-[9px] font-semibold whitespace-nowrap transition-colors shrink-0 border-b-2 ${
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
          {activeTab === "billing"       && <BillingPanel />}
          {activeTab === "teams"         && <TeamsPanel />}
          {activeTab === "plugins"       && <PluginMarketplace />}
          {activeTab === "agents"        && <AgentMarketplace />}
          {activeTab === "nodes"         && <NodeDashboard />}
          {activeTab === "containers"    && <ContainerBuilder />}
          {activeTab === "orchestrator"  && <OrchestratorConsole />}
          {activeTab === "scheduler"     && <GlobalSchedulerPanel />}
          {activeTab === "healing"       && <HealingDashboard />}
          {activeTab === "routing"       && <RoutingPanel />}
          {activeTab === "functions"     && <CloudFunctionsEditor />}
          {activeTab === "observability" && <ObservabilityPanel />}
          {activeTab === "infragen"      && <InfraGenerator />}
          {activeTab === "social"        && <SocialPanel />}
          {activeTab === "github"        && <GitHubPanel />}
          {activeTab === "growth"        && <GrowthPanel />}
          {activeTab === "marketplace"   && <MarketplaceHub />}
          {activeTab === "creator"       && <CreatorDashboard />}
          {activeTab === "plans"         && <PlansPanel />}
          {activeTab === "admin"         && <AdminPanel />}
        </div>
      </div>
    </>
  );
}
