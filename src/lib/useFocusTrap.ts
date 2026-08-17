"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keep keyboard focus inside an open dialog, and give it back on close.
 *
 * Four overlays in this app declared `aria-modal="true"` and then did nothing
 * to enforce it — the reflection prompt, the history sheet, the shortcuts
 * panel and the mobile navigation menu. That claim tells a screen reader the
 * rest of the page is inert, so a keyboard or screen-reader user tabbing out
 * of the dialog lands in content their software has been told does not exist:
 * focus vanishes into a page they cannot perceive, with no way back except
 * shift-tabbing blindly. Claiming modality without enforcing it is worse than
 * not claiming it.
 *
 * On close, focus returns to whatever opened the dialog. Without that, closing
 * the transcript sheet dropped focus back to the top of the document, which on
 * a two-thousand-line conversation page means tabbing through the entire room
 * to get back to where you were.
 *
 * `selectorRoot` is the panel to trap within — the ref must be attached to the
 * element that actually contains the controls, not the backdrop.
 */
export function useFocusTrap(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose?: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // The panel may animate in, so focus on the next frame rather than into an
    // element that is still mid-mount.
    const focusFirst = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      if (panel.contains(document.activeElement)) return;
      const target = panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!focusable.length) {
        e.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      // Focus outside the panel entirely — a click on the backdrop, or the
      // page behind — gets pulled back rather than left to wander.
      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(focusFirst);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, panelRef, onClose]);
}

/** Everything a keyboard can reach, minus anything explicitly removed. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");
