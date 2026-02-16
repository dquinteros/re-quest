import { useCallback, useEffect, useRef } from "react";

export type ShortcutId =
  | "focusSearch"
  | "selectNext"
  | "selectPrevious"
  | "openSelected"
  | "openInBrowser"
  | "openComment"
  | "openReview"
  | "openLabels"
  | "openAssignees"
  | "openReviewers"
  | "openProperties"
  | "dismiss"
  | "showShortcutsHelp";

export interface ShortcutDefinition {
  id: ShortcutId;
  keys: readonly string[];
  description: string;
}

export const SHORTCUT_DEFINITIONS: Record<ShortcutId, ShortcutDefinition> = {
  focusSearch: {
    id: "focusSearch",
    keys: ["/"],
    description: "Focus search",
  },
  selectNext: {
    id: "selectNext",
    keys: ["j", "ArrowDown"],
    description: "Select next pull request",
  },
  selectPrevious: {
    id: "selectPrevious",
    keys: ["k", "ArrowUp"],
    description: "Select previous pull request",
  },
  openSelected: {
    id: "openSelected",
    keys: ["Enter"],
    description: "Open selected pull request",
  },
  openInBrowser: {
    id: "openInBrowser",
    keys: ["o"],
    description: "Open selected pull request in GitHub",
  },
  openComment: {
    id: "openComment",
    keys: ["c"],
    description: "Open comment form",
  },
  openReview: {
    id: "openReview",
    keys: ["r"],
    description: "Open review form",
  },
  openLabels: {
    id: "openLabels",
    keys: ["l"],
    description: "Open labels form",
  },
  openAssignees: {
    id: "openAssignees",
    keys: ["a"],
    description: "Open assignees form",
  },
  openReviewers: {
    id: "openReviewers",
    keys: ["v"],
    description: "Open reviewers form",
  },
  openProperties: {
    id: "openProperties",
    keys: ["p"],
    description: "Open properties form",
  },
  dismiss: {
    id: "dismiss",
    keys: ["Escape"],
    description: "Dismiss active view",
  },
  showShortcutsHelp: {
    id: "showShortcutsHelp",
    keys: ["?"],
    description: "Show keyboard shortcuts help",
  },
};

export const SHORTCUT_IDS = Object.keys(SHORTCUT_DEFINITIONS) as ShortcutId[];

export type ShortcutCallback = (event: KeyboardEvent, shortcutId: ShortcutId) => void;
type ShortcutCallbackMap = Partial<Record<ShortcutId, ShortcutCallback>>;
type ShortcutCallbackRegistry = Record<ShortcutId, Set<ShortcutCallback>>;

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  callbacks?: ShortcutCallbackMap;
  target?: Window | Document | null;
}

export interface UseKeyboardShortcutsResult {
  registerShortcut: (shortcutId: ShortcutId, callback: ShortcutCallback) => () => void;
  unregisterShortcut: (shortcutId: ShortcutId, callback?: ShortcutCallback) => void;
  clearShortcutCallbacks: (shortcutId?: ShortcutId) => void;
}

function createShortcutCallbackRegistry(): ShortcutCallbackRegistry {
  const registry = {} as ShortcutCallbackRegistry;
  for (const shortcutId of SHORTCUT_IDS) {
    registry[shortcutId] = new Set<ShortcutCallback>();
  }

  return registry;
}

function createShortcutLookup(): Record<string, ShortcutId> {
  const lookup: Record<string, ShortcutId> = {};
  for (const definition of Object.values(SHORTCUT_DEFINITIONS)) {
    for (const key of definition.keys) {
      lookup[key] = definition.id;
    }
  }

  return lookup;
}

const SHORTCUT_BY_KEY = createShortcutLookup();

export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(
    target.closest('[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]'),
  );
}

export function normalizeShortcutKey(event: KeyboardEvent): string | null {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  if (event.key === "Esc") {
    return "Escape";
  }

  if (event.key === "/" && event.shiftKey) {
    return "?";
  }

  if (event.key.length === 1) {
    return event.key.toLowerCase();
  }

  return event.key;
}

export function getShortcutIdFromKeyboardEvent(event: KeyboardEvent): ShortcutId | null {
  const key = normalizeShortcutKey(event);
  if (!key) {
    return null;
  }

  return SHORTCUT_BY_KEY[key] ?? null;
}

export function useKeyboardShortcuts({
  enabled = true,
  callbacks = {},
  target = null,
}: UseKeyboardShortcutsOptions = {}): UseKeyboardShortcutsResult {
  const callbackMapRef = useRef<ShortcutCallbackMap>(callbacks);
  const callbackRegistryRef = useRef<ShortcutCallbackRegistry>(createShortcutCallbackRegistry());

  useEffect(() => {
    callbackMapRef.current = callbacks;
  }, [callbacks]);

  const registerShortcut = useCallback((shortcutId: ShortcutId, callback: ShortcutCallback) => {
    const callbackSet = callbackRegistryRef.current[shortcutId];
    callbackSet.add(callback);

    return () => {
      callbackSet.delete(callback);
    };
  }, []);

  const unregisterShortcut = useCallback((shortcutId: ShortcutId, callback?: ShortcutCallback) => {
    const callbackSet = callbackRegistryRef.current[shortcutId];
    if (!callback) {
      callbackSet.clear();
      return;
    }

    callbackSet.delete(callback);
  }, []);

  const clearShortcutCallbacks = useCallback((shortcutId?: ShortcutId) => {
    if (shortcutId) {
      callbackRegistryRef.current[shortcutId].clear();
      return;
    }

    for (const id of SHORTCUT_IDS) {
      callbackRegistryRef.current[id].clear();
    }
  }, []);

  const onKeyDown = useCallback((event: Event) => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    const shortcutId = getShortcutIdFromKeyboardEvent(event);
    if (!shortcutId) {
      return;
    }

    if (isEditableEventTarget(event.target)) {
      // While typing, global shortcuts should not fire, including "/" and "?".
      return;
    }

    const mappedCallback = callbackMapRef.current[shortcutId];
    const callbackSet = callbackRegistryRef.current[shortcutId];
    if (!mappedCallback && callbackSet.size === 0) {
      return;
    }

    event.preventDefault();

    mappedCallback?.(event, shortcutId);
    for (const callback of Array.from(callbackSet)) {
      callback(event, shortcutId);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const keyboardEventTarget = target ?? (typeof window === "undefined" ? null : window);
    if (!keyboardEventTarget) {
      return;
    }

    keyboardEventTarget.addEventListener("keydown", onKeyDown);

    return () => {
      keyboardEventTarget.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, onKeyDown, target]);

  return {
    registerShortcut,
    unregisterShortcut,
    clearShortcutCallbacks,
  };
}
