"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface AiFeatureBoundaryProps {
  children: ReactNode;
  /** Label shown in the error card (e.g. "AI Summary") */
  featureLabel?: string;
}

interface AiFeatureBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that wraps individual AI-powered widgets.
 * When an AI component crashes, only that widget shows an error card;
 * the rest of the page remains functional.
 */
export class AiFeatureBoundary extends Component<
  AiFeatureBoundaryProps,
  AiFeatureBoundaryState
> {
  constructor(props: AiFeatureBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AiFeatureBoundaryState {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const label = this.props.featureLabel ?? "AI Feature";
      return (
        <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <span className="font-medium text-destructive">
              {label} encountered an error
            </span>
          </div>
          {this.state.error?.message && (
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
              {this.state.error.message}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
