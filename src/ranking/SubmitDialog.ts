import type { RunSummary } from "./types";
import {
  clearAuthSession,
  isLoggedIn,
  loadAuthSession,
  loginAccount,
  logoutAccount,
  registerAccount,
} from "./authStore";
import {
  loadSavedPlayerName,
  sanitizePlayerName,
  usingRemoteScores,
} from "./scoresStore";

export type SubmitDialogResult =
  | { action: "submit"; playerName: string; asGuest: boolean }
  | { action: "cancel" };

type Tab = "guest" | "login" | "register";

const STYLE_ID = "vernan-submit-dialog-css";

/**
 * Modal for opt-in run submit.
 * Live API: fixed-size tabbed dialog with a stable footer.
 * Without an API: freeform local name (legacy mirror flow).
 */
export function openSubmitDialog(summary: RunSummary): Promise<SubmitDialogResult> {
  ensureStyles();
  if (usingRemoteScores()) {
    return openRemoteSubmitDialog(summary);
  }
  return openLocalNameDialog(summary);
}

/** Matches Java `SubmitScoreDialog` VERIFIED green. */
const VERIFIED_GREEN = "#5dcf6e";

function ensureStyles(): void {
  // Always rewrite so HMR / prior injects cannot leave stale dialog CSS.
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = `
    .vsd-root {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: grid;
      place-items: center;
      padding: 16px;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      background: rgba(5, 6, 8, 0.72);
    }
    .vsd-panel {
      width: min(31.25rem, 100%);
      height: 32.5rem;
      max-height: calc(100dvh - 32px);
      display: flex;
      flex-direction: column;
      color: #d7dde5;
      background: #151a22;
      border: 1px solid #3a4656;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
      overflow: hidden;
    }
    .vsd-accent {
      flex: 0 0 auto;
      height: 3px;
      background: #6ec8ff;
    }
    .vsd-body {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: 0.9rem 1rem 0.9rem;
      background: #151a22;
    }
    .vsd-title {
      flex: 0 0 auto;
      margin: 0 0 0.65rem;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #7d8a98;
    }
    .vsd-stats {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.4rem;
      margin: 0 0 0.65rem;
    }
    @media (max-width: 420px) {
      .vsd-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .vsd-panel { height: 36rem; }
    }
    .vsd-stat {
      padding: 0.4rem 0.35rem;
      background: #0b0d10;
      border: 1px solid #2a3440;
      text-align: center;
    }
    .vsd-stat-label {
      display: block;
      font-size: 0.58rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #5a6570;
      margin-bottom: 0.15rem;
    }
    .vsd-stat-value {
      display: block;
      font-size: 0.8rem;
      font-weight: 700;
      color: #e8ecf1;
      font-variant-numeric: tabular-nums;
    }
    .vsd-tabs {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin: 0 0 0.5rem;
      border: 1px solid #3a4656;
      background: #0b0d10;
    }
    .vsd-tab {
      appearance: none;
      border: none;
      border-right: 1px solid #2a3440;
      background: #0b0d10;
      color: #7d8a98;
      font: inherit;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 0.5rem 0.2rem;
      cursor: pointer;
    }
    .vsd-tab:last-child { border-right: none; }
    .vsd-tab:hover { color: #c8d2e6; }
    .vsd-tab[aria-selected="true"] {
      color: #d7eefc;
      background: #1a3a52;
    }
    .vsd-tab:focus-visible {
      outline: 2px solid #6ec8ff;
      outline-offset: -2px;
    }
    .vsd-session {
      flex: 0 0 auto;
      min-height: 4rem;
      margin-bottom: 0.45rem;
      padding: 0.5rem 0.65rem;
      background: #151a22;
      border: 1px solid #2a3440;
      box-sizing: border-box;
    }
    .vsd-session[data-empty="false"] {
      background: #122818;
      border-color: #3a7a48;
    }
    .vsd-session-label {
      font-size: 0.58rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #7d8a98;
      margin-bottom: 0.15rem;
      min-height: 0.85rem;
    }
    .vsd-session[data-empty="true"] .vsd-session-label {
      color: #5a6570;
      text-transform: none;
      letter-spacing: 0;
      font-size: 0.72rem;
    }
    .vsd-session-name {
      font-size: 0.95rem;
      font-weight: 700;
      color: ${VERIFIED_GREEN};
      min-height: 1.25rem;
      line-height: 1.25rem;
    }
    .vsd-session-user {
      font-size: 0.7rem;
      color: #7d8a98;
      min-height: 1rem;
    }
    .vsd-error {
      flex: 0 0 auto;
      min-height: 1.15rem;
      margin: 0 0 0.35rem;
      font-size: 0.7rem;
      line-height: 1.3;
      color: #ffb0b0;
    }
    .vsd-form {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      grid-template-rows: 2.15rem repeat(3, 3.35rem) 1fr 2.25rem;
      align-content: stretch;
      width: 100%;
    }
    .vsd-hint {
      margin: 0;
      font-size: 0.7rem;
      line-height: 1.35;
      color: #5a6570;
      height: 2.15rem;
      overflow: hidden;
    }
    .vsd-slot {
      display: grid;
      width: 100%;
      align-content: start;
    }
    .vsd-slot > * {
      grid-area: 1 / 1;
      width: 100%;
    }
    .vsd-form[data-mode="guest"] .vsd-auth-only { display: none !important; }
    .vsd-form[data-mode="auth"] .vsd-guest-only { display: none !important; }
    .vsd-field-spacer {
      height: 3.2rem;
    }
    .vsd-field {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    .vsd-field label {
      display: block;
      font-size: 0.62rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #7d8a98;
      margin-bottom: 0.2rem;
    }
    .vsd-field input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.45rem 0.55rem;
      border: 1px solid #3a4656;
      background: #0b0d10;
      color: #e8ecf1;
      font: inherit;
      font-size: 0.85rem;
    }
    .vsd-field input::placeholder { color: #5a6570; }
    .vsd-field input:focus {
      outline: none;
      border-color: #6ec8ff;
    }
    .vsd-form-action {
      display: grid;
      width: 100%;
      height: 2.25rem;
    }
    .vsd-form-action .vsd-btn {
      width: 100%;
    }
    .vsd-form[data-mode="guest"] .vsd-form-action {
      visibility: hidden;
      pointer-events: none;
    }
    .vsd-actions {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.5rem;
      margin-top: 0.65rem;
    }
    .vsd-btn {
      appearance: none;
      padding: 0.5rem 0.4rem;
      border: 1px solid #3a4656;
      background: #1a2332;
      color: #c8d2e6;
      font: inherit;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      white-space: nowrap;
      cursor: pointer;
    }
    .vsd-btn:hover:not(:disabled) {
      background: #243044;
      border-color: #5a6b7e;
    }
    .vsd-btn:focus-visible {
      outline: 2px solid #6ec8ff;
      outline-offset: 2px;
    }
    .vsd-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .vsd-btn-primary {
      border-color: #6ec8ff;
      background: #1a3a52;
      color: #d7eefc;
    }
    .vsd-btn-primary:hover:not(:disabled) {
      background: #214a66;
      border-color: #6ec8ff;
    }
    .vsd-btn-ghost {
      background: #1a2332;
      border-color: #3a4656;
      color: #c8d2e6;
    }
  `;
}

function openLocalNameDialog(summary: RunSummary): Promise<SubmitDialogResult> {
  return new Promise((resolve) => {
    const { root, body, finish } = createShell("Submit run", resolve, false);
    body.append(
      statsRow(summary),
      hintEl("Saves locally and downloads scores.json for the repo mirror."),
    );

    const field = fieldBlock("Name", "vernan-submit-name", {
      maxLength: 20,
      placeholder: "Anonymous",
      value: guestNameDefault(),
      autocomplete: "username",
    });
    body.append(field.wrap);

    const actions = document.createElement("div");
    actions.className = "vsd-actions";
    actions.style.gridTemplateColumns = "1fr 1fr";
    const cancelBtn = btn("Cancel", "ghost");
    const submitBtn = btn("Submit & quit", "primary");
    cancelBtn.addEventListener("click", () => finish({ action: "cancel" }));
    submitBtn.addEventListener("click", () => {
      finish({
        action: "submit",
        playerName: sanitizePlayerName(field.input.value || "Anonymous"),
        asGuest: true,
      });
    });
    field.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitBtn.click();
      }
    });
    actions.append(cancelBtn, submitBtn);
    body.append(actions);
    document.body.append(root);
    field.input.focus();
    field.input.select();
  });
}

function openRemoteSubmitDialog(summary: RunSummary): Promise<SubmitDialogResult> {
  return new Promise((resolve) => {
    const { root, body, finish } = createShell("Submit run", resolve, true);
    let busy = false;

    body.append(statsRow(summary));

    const tabs = document.createElement("div");
    tabs.className = "vsd-tabs";
    tabs.setAttribute("role", "tablist");
    const tabGuest = tabButton("Guest", "guest");
    const tabLogin = tabButton("Log in", "login");
    const tabRegister = tabButton("Create Account", "register");
    tabs.append(tabGuest, tabLogin, tabRegister);

    const sessionEl = document.createElement("div");
    sessionEl.className = "vsd-session";
    sessionEl.dataset.empty = "true";
    const sessionLabel = document.createElement("div");
    sessionLabel.className = "vsd-session-label";
    sessionLabel.textContent = "Not signed in";
    const sessionName = document.createElement("div");
    sessionName.className = "vsd-session-name";
    sessionName.textContent = "\u00a0";
    const sessionUser = document.createElement("div");
    sessionUser.className = "vsd-session-user";
    sessionUser.textContent = "\u00a0";
    sessionEl.append(sessionLabel, sessionName, sessionUser);

    const errorEl = document.createElement("div");
    errorEl.className = "vsd-error";
    errorEl.setAttribute("role", "alert");
    errorEl.textContent = "\u00a0";

    // One fixed grid: Guest / Log in / Create Account share the same slots.
    let authMode: "login" | "register" = "login";
    const form = document.createElement("div");
    form.className = "vsd-form";
    form.dataset.mode = "guest";

    const formHint = hintEl("Enter a name and submit as guest.");

    const guestName = fieldBlock("Display name", "vernan-submit-name", {
      maxLength: 20,
      placeholder: "Anonymous",
      value: guestNameDefault(),
      autocomplete: "username",
    });
    guestName.wrap.classList.add("vsd-guest-only");

    const authUser = fieldBlock("Username", "vernan-auth-user", {
      maxLength: 20,
      placeholder: "username",
      autocomplete: "username",
    });
    authUser.wrap.classList.add("vsd-auth-only");

    const authPass = fieldBlock("Password", "vernan-auth-pass", {
      maxLength: 128,
      type: "password",
      autocomplete: "current-password",
    });
    authPass.wrap.classList.add("vsd-auth-only");

    const authDisplay = fieldBlock("Display name", "vernan-auth-display", {
      maxLength: 20,
      placeholder: "Shown on leaderboard",
      value: guestNameDefault(),
    });
    authDisplay.wrap.classList.add("vsd-auth-only");

    const spacer = () => {
      const el = document.createElement("div");
      el.className = "vsd-field-spacer vsd-guest-only";
      el.setAttribute("aria-hidden", "true");
      return el;
    };

    const slot1 = document.createElement("div");
    slot1.className = "vsd-slot";
    slot1.append(guestName.wrap, authDisplay.wrap);

    const slot2 = document.createElement("div");
    slot2.className = "vsd-slot";
    slot2.append(spacer(), authUser.wrap);

    const slot3 = document.createElement("div");
    slot3.className = "vsd-slot";
    slot3.append(spacer(), authPass.wrap);

    const authFormAction = document.createElement("div");
    authFormAction.className = "vsd-form-action";
    const authActionBtn = btn("Log in", "primary");
    authFormAction.append(authActionBtn);

    form.append(formHint, slot1, slot2, slot3, document.createElement("div"), authFormAction);

    // --- Stable footer ---
    const actions = document.createElement("div");
    actions.className = "vsd-actions";
    const cancelBtn = btn("Cancel", "secondary");
    const guestBtn = btn("Submit as guest", "secondary");
    const submitBtn = btn("Submit & quit", "primary");
    actions.append(cancelBtn, guestBtn, submitBtn);

    body.append(tabs, sessionEl, errorEl, form, actions);
    document.body.append(root);

    const setError = (msg: string | null) => {
      errorEl.textContent = msg && msg.trim() ? msg : "\u00a0";
    };

    const setBusy = (next: boolean) => {
      busy = next;
      for (const b of [
        cancelBtn,
        guestBtn,
        submitBtn,
        authActionBtn,
        tabGuest,
        tabLogin,
        tabRegister,
      ]) {
        b.disabled = next;
      }
      syncFieldInteractivity();
      if (!next) syncSessionUi();
    };

    const syncFieldInteractivity = () => {
      const guest = form.dataset.mode === "guest";
      guestName.input.disabled = busy || !guest;
      authUser.input.disabled = busy || guest;
      authPass.input.disabled = busy || guest;
      authDisplay.input.disabled = busy || guest;
      authActionBtn.disabled = busy || guest;
    };

    const doLogout = async () => {
      if (busy || !isLoggedIn()) return;
      setBusy(true);
      await logoutAccount();
      clearAuthSession();
      setBusy(false);
      syncSessionUi();
      showTab("guest");
    };

    const syncSessionUi = () => {
      const session = loadAuthSession();
      const loggedIn = session != null;
      if (loggedIn && session) {
        sessionEl.dataset.empty = "false";
        sessionLabel.textContent = "Signed in";
        sessionName.textContent = session.displayName;
        // Inline color so verified green cannot be lost to stale CSS.
        sessionName.style.color = VERIFIED_GREEN;
        sessionUser.textContent = `@${session.username}`;
        tabLogin.textContent = "Log out";
      } else {
        sessionEl.dataset.empty = "true";
        sessionLabel.textContent = "Not signed in";
        sessionName.textContent = "\u00a0";
        sessionName.style.color = "";
        sessionUser.textContent = "\u00a0";
        tabLogin.textContent = "Log in";
      }
      submitBtn.disabled = busy || !loggedIn;
      guestBtn.disabled = busy;
      cancelBtn.disabled = busy;
    };

    const syncAuthPane = (mode: "login" | "register") => {
      authMode = mode;
      const isRegister = mode === "register";
      formHint.textContent = isRegister
        ? "Username 3–20 letters/numbers/_ · password 8+."
        : "Log in to submit with a verified green name.";
      authActionBtn.textContent = isRegister ? "Create account" : "Log in";
      authPass.input.autocomplete = isRegister ? "new-password" : "current-password";
      authDisplay.input.placeholder = isRegister
        ? "Shown on leaderboard"
        : "Optional — used only when creating an account";
    };

    const showTab = (next: Tab) => {
      if (busy) return;
      setError(null);
      for (const [btnEl, id] of [
        [tabGuest, "guest"],
        [tabLogin, "login"],
        [tabRegister, "register"],
      ] as const) {
        btnEl.setAttribute("aria-selected", id === next ? "true" : "false");
      }
      if (next === "guest") {
        form.dataset.mode = "guest";
        formHint.textContent = "Enter a name and submit as guest.";
        syncFieldInteractivity();
        guestName.input.focus();
        guestName.input.select();
      } else {
        form.dataset.mode = "auth";
        syncAuthPane(next === "register" ? "register" : "login");
        syncFieldInteractivity();
        authDisplay.input.focus();
      }
    };

    const doAuth = async () => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        if (authMode === "register") {
          await registerAccount(
            authUser.input.value.trim(),
            authPass.input.value,
            authDisplay.input.value.trim() || authUser.input.value.trim(),
          );
        } else {
          await loginAccount(authUser.input.value.trim(), authPass.input.value);
        }
        setBusy(false);
        syncSessionUi();
        showTab("guest");
      } catch (err) {
        setBusy(false);
        setError(err instanceof Error ? err.message : "Auth failed");
      }
    };

    cancelBtn.addEventListener("click", () => finish({ action: "cancel" }));
    guestBtn.addEventListener("click", () => {
      finish({
        action: "submit",
        playerName: sanitizePlayerName(guestName.input.value || "Anonymous"),
        asGuest: true,
      });
    });
    submitBtn.addEventListener("click", () => {
      const session = loadAuthSession();
      if (!session) return;
      finish({
        action: "submit",
        playerName: session.displayName,
        asGuest: false,
      });
    });

    authActionBtn.addEventListener("click", () => void doAuth());
    authPass.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void doAuth();
      }
    });
    authDisplay.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void doAuth();
      }
    });
    guestName.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        guestBtn.click();
      }
    });

    tabGuest.addEventListener("click", () => showTab("guest"));
    tabLogin.addEventListener("click", () => {
      if (isLoggedIn()) {
        void doLogout();
        return;
      }
      showTab("login");
    });
    tabRegister.addEventListener("click", () => showTab("register"));

    syncSessionUi();
    showTab("guest");
  });
}

function createShell(
  titleText: string,
  resolve: (r: SubmitDialogResult) => void,
  fixedRemote: boolean,
): {
  root: HTMLDivElement;
  body: HTMLDivElement;
  finish: (r: SubmitDialogResult) => void;
} {
  const root = document.createElement("div");
  root.className = "vsd-root";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", titleText);

  const panel = document.createElement("div");
  panel.className = "vsd-panel";
  if (!fixedRemote) {
    panel.style.height = "auto";
  }

  const accent = document.createElement("div");
  accent.className = "vsd-accent";
  accent.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "vsd-body";

  const title = document.createElement("h2");
  title.className = "vsd-title";
  title.textContent = fixedRemote ? "SUBMIT RUN" : titleText;
  body.append(title);

  panel.append(accent, body);
  root.append(panel);

  let settled = false;
  const finish = (result: SubmitDialogResult) => {
    if (settled) return;
    settled = true;
    document.removeEventListener("keydown", onKey);
    root.remove();
    resolve(result);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish({ action: "cancel" });
    }
  };
  document.addEventListener("keydown", onKey);

  return { root, body, finish };
}

function statsRow(summary: RunSummary): HTMLElement {
  const row = document.createElement("div");
  row.className = "vsd-stats";
  const items: [string, string][] = [
    ["Floor", String(summary.floorReached)],
    ["Coins", String(summary.coins)],
    ["Kills", `${summary.enemiesKilled}/${summary.enemiesKillDifficulty}`],
    ["Seed", String(summary.seed)],
  ];
  for (const [label, value] of items) {
    const cell = document.createElement("div");
    cell.className = "vsd-stat";
    const l = document.createElement("span");
    l.className = "vsd-stat-label";
    l.textContent = label;
    const v = document.createElement("span");
    v.className = "vsd-stat-value";
    v.textContent = value;
    cell.append(l, v);
    row.append(cell);
  }
  return row;
}

function hintEl(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "vsd-hint";
  p.textContent = text;
  return p;
}

function tabButton(label: string, mode: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "vsd-tab";
  b.textContent = label;
  b.dataset.mode = mode;
  b.setAttribute("role", "tab");
  b.setAttribute("aria-selected", "false");
  return b;
}

function fieldBlock(
  labelText: string,
  id: string,
  opts: {
    maxLength?: number;
    placeholder?: string;
    value?: string;
    type?: string;
    autocomplete?: string;
  },
): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement("div");
  wrap.className = "vsd-field";
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement("input");
  input.id = id;
  input.type = opts.type ?? "text";
  if (opts.maxLength != null) input.maxLength = opts.maxLength;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.value) input.value = opts.value;
  if (opts.autocomplete) input.autocomplete = opts.autocomplete as AutoFill;
  wrap.append(label, input);
  return { wrap, input };
}

function btn(label: string, kind: "primary" | "secondary" | "ghost"): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className =
    kind === "primary"
      ? "vsd-btn vsd-btn-primary"
      : kind === "ghost"
        ? "vsd-btn vsd-btn-ghost"
        : "vsd-btn";
  b.textContent = label;
  return b;
}

function guestNameDefault(): string {
  const n = loadSavedPlayerName();
  return n === "Anonymous" ? "" : n;
}
