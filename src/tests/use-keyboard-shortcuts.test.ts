// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function dispatchKey(target: EventTarget, key: string, shiftKey = false) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("useKeyboardShortcuts", () => {
  it("fires mapped shortcut callbacks", () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const onHelp = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts({
        callbacks: {
          selectNext: onNext,
          selectPrevious: onPrevious,
          showShortcutsHelp: onHelp,
        },
      }),
    );

    act(() => {
      dispatchKey(window, "j");
      dispatchKey(window, "k");
      dispatchKey(window, "/", true);
    });

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledWith(expect.any(KeyboardEvent), "selectNext");
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onPrevious).toHaveBeenCalledWith(expect.any(KeyboardEvent), "selectPrevious");
    expect(onHelp).toHaveBeenCalledTimes(1);
    expect(onHelp).toHaveBeenCalledWith(expect.any(KeyboardEvent), "showShortcutsHelp");
  });

  it("does not hijack input and textarea typing", () => {
    const onNext = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts({
        callbacks: {
          selectNext: onNext,
        },
      }),
    );

    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    document.body.appendChild(input);
    document.body.appendChild(textarea);

    act(() => {
      input.focus();
      dispatchKey(input, "j");

      textarea.focus();
      dispatchKey(textarea, "j");
    });

    expect(onNext).not.toHaveBeenCalled();
  });
});
