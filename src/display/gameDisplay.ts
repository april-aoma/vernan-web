import {
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  WINDOW_SCALE,
} from "../specs";
import {
  computeDisplayShellLayout,
  type DisplayShellLayout,
} from "./DisplayShell";

type DocFs = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type ElFs = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
};

export type GameDisplayOptions = {
  /** Element that hosts the game canvas (usually `#vernan-root`). */
  root: HTMLElement;
  /** Toggle control; label updates between Fullscreen / Exit. */
  toggleButton?: HTMLButtonElement | null;
  /** Shown while immersive in a normal browser tab (hidden in standalone). */
  exitButton?: HTMLButtonElement | null;
  /** Called whenever the shell layout is recomputed. */
  onShellLayout?: (layout: DisplayShellLayout) => void;
  /** Stick on left / face on right (default true). */
  stickOnLeft?: boolean;
};

export type GameDisplayHandle = {
  destroy: () => void;
  getShellLayout: () => DisplayShellLayout;
  fitNow: () => void;
};

/**
 * Scales the shell canvas to the available viewport, enters immersive layout for
 * fullscreen / home-screen standalone, and wires a Fullscreen control.
 * Uses native portrait/landscape (no force-landscape rotate) so the display
 * shell can place controls in side gutters or a bottom band.
 */
export function installGameDisplay(opts: GameDisplayOptions): GameDisplayHandle {
  const {
    root,
    toggleButton = null,
    exitButton = null,
    onShellLayout,
    stickOnLeft = true,
  } = opts;
  const html = document.documentElement;

  let shellLayout: DisplayShellLayout = computeDisplayShellLayout(
    DISPLAY_WIDTH,
    DISPLAY_HEIGHT,
    { stickOnLeft },
  );

  const canvas = (): HTMLCanvasElement | null =>
    root.querySelector("canvas");

  const isStandalone = (): boolean => {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true;
  };

  const fullscreenElement = (): Element | null => {
    const doc = document as DocFs;
    return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  };

  const isFullscreen = (): boolean => fullscreenElement() != null;

  const isImmersive = (): boolean => html.classList.contains("immersive");

  const blockBrowserGesture = (e: Event): void => {
    if (!isImmersive()) return;
    e.preventDefault();
  };

  const setImmersive = (on: boolean): void => {
    html.classList.toggle("immersive", on);
    document.body.classList.toggle("immersive", on);
    html.classList.remove("force-landscape");
    syncChrome();
    fitCanvas();
  };

  const syncChrome = (): void => {
    const standalone = isStandalone();
    const immersive = isImmersive();
    const fs = isFullscreen();

    if (toggleButton) {
      toggleButton.hidden = standalone;
      const active = immersive || fs;
      toggleButton.setAttribute("aria-pressed", active ? "true" : "false");
      toggleButton.textContent = active ? "Exit full" : "Fullscreen";
    }

    if (exitButton) {
      exitButton.hidden = standalone || !immersive;
    }
  };

  const readSafeInsets = (): { top: number; right: number; bottom: number; left: number } => {
    const cs = getComputedStyle(html);
    const px = (name: string): number => {
      const raw = cs.getPropertyValue(name).trim();
      const n = Number.parseFloat(raw);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      top: px("--safe-t"),
      right: px("--safe-r"),
      bottom: px("--safe-b"),
      left: px("--safe-l"),
    };
  };

  const availableSize = (): { w: number; h: number } => {
    const vv = window.visualViewport;
    const vw = Math.floor(vv?.width ?? window.innerWidth);
    const vh = Math.floor(vv?.height ?? window.innerHeight);

    if (isImmersive()) {
      // Fill the visual viewport; safe-area is applied inside shell layout.
      return { w: Math.max(1, vw), h: Math.max(1, vh) };
    }

    // Leave room for page chrome + body padding when not immersive.
    const pad = 48;
    const chromeBudget = 220;
    return {
      w: Math.max(1, vw - pad),
      h: Math.max(1, vh - chromeBudget),
    };
  };

  const applyShellSize = (layout: DisplayShellLayout): void => {
    const el = canvas();
    if (!el) return;
    el.style.width = `${layout.shellW}px`;
    el.style.height = `${layout.shellH}px`;
  };

  const fitCanvas = (): void => {
    const { w: availW, h: availH } = availableSize();
    const immersive = isImmersive();
    const safe = immersive
      ? readSafeInsets()
      : { top: 0, right: 0, bottom: 0, left: 0 };
    // Page: hug Java-sized game + control chrome. Immersive: fill the viewport.
    shellLayout = computeDisplayShellLayout(availW, availH, {
      stickOnLeft,
      safe,
      maxPlayScale: WINDOW_SCALE,
      fitMode: immersive ? "window" : "content",
    });
    applyShellSize(shellLayout);
    onShellLayout?.(shellLayout);
  };

  const requestFs = async (el: HTMLElement): Promise<boolean> => {
    const anyEl = el as ElFs;
    try {
      if (typeof el.requestFullscreen === "function") {
        await el.requestFullscreen();
        return true;
      }
      if (typeof anyEl.webkitRequestFullscreen === "function") {
        await anyEl.webkitRequestFullscreen();
        return true;
      }
      if (typeof anyEl.webkitRequestFullScreen === "function") {
        await anyEl.webkitRequestFullScreen();
        return true;
      }
    } catch {
      // User denial / unsupported — immersive CSS still applies.
    }
    return false;
  };

  const exitFs = async (): Promise<void> => {
    const doc = document as DocFs;
    try {
      if (fullscreenElement() == null) return;
      if (typeof document.exitFullscreen === "function") {
        await document.exitFullscreen();
        return;
      }
      if (typeof doc.webkitExitFullscreen === "function") {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // ignore
    }
  };

  const enterImmersive = async (): Promise<void> => {
    setImmersive(true);
    await requestFs(html);
    canvas()?.focus({ preventScroll: true });
  };

  const leaveImmersive = async (): Promise<void> => {
    if (isStandalone()) {
      syncChrome();
      fitCanvas();
      return;
    }
    await exitFs();
    setImmersive(false);
  };

  const toggle = async (): Promise<void> => {
    if (isStandalone()) return;
    if (isImmersive() || isFullscreen()) {
      await leaveImmersive();
    } else {
      await enterImmersive();
    }
  };

  const onFsChange = (): void => {
    if (isStandalone()) {
      setImmersive(true);
      return;
    }
    if (isFullscreen()) {
      setImmersive(true);
    } else if (isImmersive()) {
      setImmersive(false);
    } else {
      syncChrome();
      fitCanvas();
    }
  };

  const onViewportChange = (): void => {
    fitCanvas();
  };

  const onToggleClick = (e: Event): void => {
    e.preventDefault();
    void toggle();
  };

  const onExitClick = (e: Event): void => {
    e.preventDefault();
    void leaveImmersive();
  };

  toggleButton?.addEventListener("click", onToggleClick);
  exitButton?.addEventListener("click", onExitClick);
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
  window.addEventListener("resize", onViewportChange);
  window.visualViewport?.addEventListener("resize", onViewportChange);
  window.addEventListener("orientationchange", onViewportChange);
  // Keep immersive touches from selecting text / callouts / scroll-chaining.
  document.addEventListener("selectstart", blockBrowserGesture, { capture: true });
  document.addEventListener("gesturestart", blockBrowserGesture, { capture: true, passive: false });
  document.addEventListener("touchmove", blockBrowserGesture, { capture: true, passive: false });

  if (isStandalone()) {
    setImmersive(true);
  } else {
    syncChrome();
    fitCanvas();
  }

  requestAnimationFrame(() => {
    fitCanvas();
    syncChrome();
  });

  return {
    destroy: () => {
      toggleButton?.removeEventListener("click", onToggleClick);
      exitButton?.removeEventListener("click", onExitClick);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      window.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      document.removeEventListener("selectstart", blockBrowserGesture, { capture: true } as EventListenerOptions);
      document.removeEventListener("gesturestart", blockBrowserGesture, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchmove", blockBrowserGesture, { capture: true } as EventListenerOptions);
    },
    getShellLayout: () => shellLayout,
    fitNow: fitCanvas,
  };
}
