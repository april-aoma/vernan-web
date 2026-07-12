import {
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
} from "../specs";

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
};

/**
 * Scales the canvas to the available viewport, enters immersive layout for
 * fullscreen / home-screen standalone, and wires a Fullscreen control.
 */
export function installGameDisplay(opts: GameDisplayOptions): { destroy: () => void } {
  const { root, toggleButton = null, exitButton = null } = opts;
  const html = document.documentElement;

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

  const setImmersive = (on: boolean): void => {
    html.classList.toggle("immersive", on);
    document.body.classList.toggle("immersive", on);
    if (!on) html.classList.remove("force-landscape");
    syncChrome();
    syncLandscapeRotate();
    fitCanvas();
  };

  const syncChrome = (): void => {
    const standalone = isStandalone();
    const immersive = isImmersive();
    const fs = isFullscreen();

    if (toggleButton) {
      // Home-screen apps already fill the display; keep the control for browser tabs.
      toggleButton.hidden = standalone;
      const active = immersive || fs;
      toggleButton.setAttribute("aria-pressed", active ? "true" : "false");
      toggleButton.textContent = active ? "Exit full" : "Fullscreen";
    }

    if (exitButton) {
      // Floating exit only when chrome is hidden in a regular browser tab.
      exitButton.hidden = standalone || !immersive;
    }
  };

  const availableSize = (): { w: number; h: number } => {
    const vv = window.visualViewport;
    const vw = Math.floor(vv?.width ?? window.innerWidth);
    const vh = Math.floor(vv?.height ?? window.innerHeight);

    if (isImmersive()) {
      // CSS 90° fallback: treat the portrait viewport as landscape for layout.
      if (needsLandscapeRotate()) {
        return { w: Math.max(1, vh), h: Math.max(1, vw) };
      }
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

  const fitCanvas = (): void => {
    const el = canvas();
    if (!el) return;

    const { w: availW, h: availH } = availableSize();
    const aspect = INTERNAL_WIDTH / INTERNAL_HEIGHT;

    let cssW: number;
    let cssH: number;

    if (isImmersive()) {
      cssW = availW;
      cssH = cssW / aspect;
      if (cssH > availH) {
        cssH = availH;
        cssW = cssH * aspect;
      }
    } else {
      const maxW = Math.min(DISPLAY_WIDTH, availW);
      const maxH = Math.min(DISPLAY_HEIGHT, availH);
      cssW = maxW;
      cssH = cssW / aspect;
      if (cssH > maxH) {
        cssH = maxH;
        cssW = cssH * aspect;
      }
    }

    cssW = Math.max(1, Math.floor(cssW));
    cssH = Math.max(1, Math.floor(cssW / aspect));
    if (cssH > availH) {
      cssH = Math.max(1, Math.floor(availH));
      cssW = Math.max(1, Math.floor(cssH * aspect));
    }

    el.style.width = `${cssW}px`;
    el.style.height = `${cssH}px`;
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

  const isPortrait = (): boolean =>
    window.matchMedia("(orientation: portrait)").matches;

  /** True when immersive but the device is still portrait (lock unsupported/denied). */
  const needsLandscapeRotate = (): boolean => isImmersive() && isPortrait();

  const syncLandscapeRotate = (): void => {
    html.classList.toggle("force-landscape", needsLandscapeRotate());
  };

  const tryLockLandscape = async (): Promise<void> => {
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      if (typeof orientation.lock === "function") {
        await orientation.lock("landscape");
      }
    } catch {
      // Requires fullscreen or installed PWA on most browsers; iOS has no lock API.
    }
    syncLandscapeRotate();
    fitCanvas();
  };

  const unlockOrientation = (): void => {
    try {
      screen.orientation?.unlock?.();
    } catch {
      // ignore
    }
    html.classList.remove("force-landscape");
  };

  const enterImmersive = async (): Promise<void> => {
    setImmersive(true);
    const ok = await requestFs(html);
    // Lock when FS works; otherwise CSS rotate handles portrait (e.g. iOS).
    if (ok || isStandalone() || isImmersive()) {
      await tryLockLandscape();
    }
    canvas()?.focus({ preventScroll: true });
  };

  const leaveImmersive = async (): Promise<void> => {
    if (isStandalone()) {
      // Standalone stays immersive; only unlock orientation if possible.
      syncChrome();
      syncLandscapeRotate();
      fitCanvas();
      return;
    }
    unlockOrientation();
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
      void tryLockLandscape();
      return;
    }
    if (isFullscreen()) {
      setImmersive(true);
      void tryLockLandscape();
    } else if (isImmersive()) {
      // Esc / system exit — restore page chrome.
      unlockOrientation();
      setImmersive(false);
    } else {
      unlockOrientation();
      syncChrome();
      fitCanvas();
    }
  };

  const onViewportChange = (): void => {
    syncLandscapeRotate();
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

  // Home Screen / installed app: fill the display immediately.
  if (isStandalone()) {
    setImmersive(true);
    void tryLockLandscape();
  } else {
    syncChrome();
    fitCanvas();
  }

  // Canvas is created synchronously inside mount(), but fit again next frame
  // in case layout/fonts settle.
  requestAnimationFrame(() => {
    syncLandscapeRotate();
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
    },
  };
}
