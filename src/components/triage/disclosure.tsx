"use client";

import clsx from "clsx";
import { useState, type ReactNode } from "react";

interface DisclosureProps {
  title: string;
  toggleId: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  toggleClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}

export function Disclosure({
  title,
  toggleId,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
  toggleClassName,
  contentClassName,
  children,
}: DisclosureProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? uncontrolledOpen;
  const contentId = `${toggleId}-content`;

  function handleOpenChange(nextOpen: boolean) {
    if (open === undefined) {
      setUncontrolledOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  }

  return (
    <section className={className}>
      <button
        type="button"
        id={toggleId}
        data-control-id={toggleId}
        data-shortcut-target={toggleId}
        className={clsx("triage-disclosure-toggle", toggleClassName)}
        aria-expanded={resolvedOpen}
        aria-controls={contentId}
        onClick={() => {
          handleOpenChange(!resolvedOpen);
        }}
      >
        <span>{title}</span>
        <span aria-hidden>{resolvedOpen ? "Hide" : "Show"}</span>
      </button>
      <div id={contentId} hidden={!resolvedOpen} className={contentClassName}>
        {children}
      </div>
    </section>
  );
}
