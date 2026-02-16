"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AppNavProps {
  viewerLabel?: string | null;
  themeLabel?: string;
  signingOut?: boolean;
  authenticated?: boolean;
  onToggleTheme?: () => void;
  onSignOut?: () => void;
}

export function AppNav({
  viewerLabel = null,
  themeLabel = "Dark mode",
  signingOut = false,
  authenticated = true,
  onToggleTheme,
  onSignOut,
}: AppNavProps) {
  const pathname = usePathname();
  const isDark = themeLabel === "Light mode";

  return (
    <nav
      className="sticky top-0 z-50 flex items-center h-12 px-4 border-b border-border bg-background/80 backdrop-blur-sm"
      aria-label="Main navigation"
    >
      <Link href="/" className="text-sm font-bold text-foreground tracking-tight mr-6">
        Re-Quest
      </Link>

      {authenticated && (
        <div className="flex items-center gap-0.5">
          <Link
            href="/"
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              pathname === "/"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            Triage
          </Link>
          <Link
            href="/tracked-repositories"
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              pathname === "/tracked-repositories"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            Tracked Repos
          </Link>
          <Link
            href="/flow-config"
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              pathname === "/flow-config"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            Flow Rules
          </Link>
          <Link
            href="/insights"
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              pathname === "/insights"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            Insights
          </Link>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {viewerLabel && (
          <span className="text-xs text-muted-foreground hidden sm:inline mr-2">{viewerLabel}</span>
        )}
        {onToggleTheme && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onToggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={themeLabel}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}
        {authenticated && onSignOut && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onSignOut}
            disabled={signingOut}
            aria-label="Sign out"
            title={signingOut ? "Signing out..." : "Sign out"}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    </nav>
  );
}
