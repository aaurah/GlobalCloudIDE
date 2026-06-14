import React, { useState } from "react";
import { usePlatform } from "../../hooks/use-platform";
import { Button } from "../ui/button";
import {
  Moon, Sun, Type, Terminal, Zap, Globe, Bell, Code2,
  LogOut, ChevronRight, Shield, BrainCircuit, RefreshCw
} from "lucide-react";

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ icon, label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-border/50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">
          {icon}
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          {description && <div className="text-[10px] text-muted-foreground">{description}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors touch-manipulation ${value ? "bg-primary" : "bg-muted"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export function MobileSettingsPanel() {
  const { user, logout } = usePlatform();

  // Persisted settings
  const get = (key: string, def: string) => localStorage.getItem(`ide_setting_${key}`) ?? def;
  const set = (key: string, val: string) => { localStorage.setItem(`ide_setting_${key}`, val); };

  const [fontSize, setFontSizeState] = useState(() => parseInt(get("fontSize", "14")));
  const [tabSize, setTabSizeState] = useState(() => parseInt(get("tabSize", "2")));
  const [wordWrap, setWordWrapState] = useState(() => get("wordWrap", "true") === "true");
  const [autoSave, setAutoSaveState] = useState(() => get("autoSave", "false") === "true");
  const [notifications, setNotificationsState] = useState(() => get("notifications", "true") === "true");
  const [betaFeatures, setBetaFeaturesState] = useState(() => get("betaFeatures", "false") === "true");
  const [defaultLang, setDefaultLangState] = useState(() => get("defaultLang", "node"));

  const updateFontSize = (v: number) => { setFontSizeState(v); set("fontSize", String(v)); };
  const updateTabSize = (v: number) => { setTabSizeState(v); set("tabSize", String(v)); };
  const updateWordWrap = (v: boolean) => { setWordWrapState(v); set("wordWrap", String(v)); };
  const updateAutoSave = (v: boolean) => { setAutoSaveState(v); set("autoSave", String(v)); };
  const updateNotifications = (v: boolean) => { setNotificationsState(v); set("notifications", String(v)); };
  const updateBetaFeatures = (v: boolean) => { setBetaFeaturesState(v); set("betaFeatures", String(v)); };
  const updateDefaultLang = (v: string) => { setDefaultLangState(v); set("defaultLang", v); };

  const handleClearCache = () => {
    if (confirm("Clear editor cache and reload?")) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => location.reload());
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Profile */}
      {user && (
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border bg-muted/20">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
            {user.username[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{user.username}</div>
            <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
          </div>
          <ChevronRight size={14} className="text-muted-foreground" />
        </div>
      )}

      {/* Editor section */}
      <div className="pt-2">
        <div className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Editor</div>

        <SettingRow icon={<Type size={15} />} label="Font Size" description={`${fontSize}px`}>
          <div className="flex items-center gap-2">
            <button onClick={() => updateFontSize(Math.max(10, fontSize - 1))} className="w-7 h-7 rounded-full border border-border text-sm touch-manipulation hover:bg-muted">−</button>
            <span className="text-sm font-mono w-8 text-center">{fontSize}</span>
            <button onClick={() => updateFontSize(Math.min(24, fontSize + 1))} className="w-7 h-7 rounded-full border border-border text-sm touch-manipulation hover:bg-muted">+</button>
          </div>
        </SettingRow>

        <SettingRow icon={<Code2 size={15} />} label="Tab Size">
          <div className="flex items-center gap-1">
            {[2, 4].map(n => (
              <button key={n} onClick={() => updateTabSize(n)} className={`w-8 h-7 rounded border text-xs font-mono touch-manipulation ${tabSize === n ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>{n}</button>
            ))}
          </div>
        </SettingRow>

        <SettingRow icon={<Terminal size={15} />} label="Word Wrap">
          <Toggle value={wordWrap} onChange={updateWordWrap} />
        </SettingRow>

        <SettingRow icon={<Zap size={15} />} label="Auto Save">
          <Toggle value={autoSave} onChange={updateAutoSave} />
        </SettingRow>
      </div>

      {/* Runtime section */}
      <div className="pt-2">
        <div className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Runtime</div>

        <SettingRow icon={<Globe size={15} />} label="Default Language">
          <select value={defaultLang} onChange={e => updateDefaultLang(e.target.value)} className="h-7 px-2 text-xs bg-muted/30 border border-border rounded-md text-foreground touch-manipulation">
            <option value="node">Node.js</option>
            <option value="python">Python</option>
            <option value="bash">Bash</option>
          </select>
        </SettingRow>
      </div>

      {/* App section */}
      <div className="pt-2">
        <div className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">App</div>

        <SettingRow icon={<Bell size={15} />} label="Notifications">
          <Toggle value={notifications} onChange={updateNotifications} />
        </SettingRow>

        <SettingRow icon={<BrainCircuit size={15} />} label="Beta Features">
          <Toggle value={betaFeatures} onChange={updateBetaFeatures} />
        </SettingRow>

        <button
          onClick={handleClearCache}
          className="w-full flex items-center justify-between py-3 px-4 border-b border-border/50 touch-manipulation hover:bg-muted/20"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground">
              <RefreshCw size={15} />
            </div>
            <div className="text-sm font-medium text-left">Clear Cache & Reload</div>
          </div>
          <ChevronRight size={14} className="text-muted-foreground" />
        </button>
      </div>

      {/* Account section */}
      <div className="pt-2 pb-8">
        <div className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Account</div>
        {user ? (
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 py-3 px-4 text-red-400 touch-manipulation hover:bg-red-900/10"
          >
            <div className="w-8 h-8 rounded-lg bg-red-700/10 flex items-center justify-center">
              <LogOut size={15} className="text-red-400" />
            </div>
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        ) : (
          <div className="px-4 py-3 text-xs text-muted-foreground">Not signed in</div>
        )}

        {/* App version */}
        <div className="px-4 pt-6 text-center text-[10px] text-muted-foreground/40">
          CloudIDE v1.0.0 · Cloud OS Edition
        </div>
      </div>
    </div>
  );
}
