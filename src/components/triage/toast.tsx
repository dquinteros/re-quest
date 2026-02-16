"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ToastMessage {
  id: number;
  text: string;
  type: "info" | "error";
}

const AUTO_DISMISS_MS = 4000;
const EXIT_ANIMATION_MS = 250;

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  const [dismissing, setDismissing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDismissing(true);
      setTimeout(() => onDismiss(toast.id), EXIT_ANIMATION_MS);
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, onDismiss]);

  return (
    <div
      className={cn(
        "rounded-md px-4 py-2.5 text-sm shadow-lg border transition-all duration-200",
        toast.type === "error"
          ? "bg-destructive/10 text-destructive border-destructive/20"
          : "bg-background text-foreground border-border",
        dismissing && "opacity-0 translate-y-2",
      )}
      role={toast.type === "error" ? "alert" : "status"}
    >
      {toast.text}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((text: string, type: "info" | "error" = "info") => {
    counterRef.current += 1;
    const id = counterRef.current;
    setToasts((prev) => [...prev, { id, text, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
