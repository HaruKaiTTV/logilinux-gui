import { Settings, Info, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const navItems = [
    { id: "devices", label: "Devices", icon: Layers },
    { id: "profiles", label: "Profiles", icon: Layers },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "about", label: "About", icon: Info },
  ];

  return (
    <div className="w-64 border-r bg-card flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold text-logi-blue">LogiLinux</h1>
        <p className="text-sm text-muted-foreground mt-1">Device Configuration</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                currentPage === item.id
                  ? "bg-logi-blue text-white"
                  : "hover:bg-accent text-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground text-center">
          Version 1.0.0
        </p>
      </div>
    </div>
  );
}
