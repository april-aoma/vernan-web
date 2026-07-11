/**
 * Standalone account dialog (pause menu): Log in / Create Account only.
 * Shares chrome with {@link openSubmitDialog}; no guest or score submit.
 */

import {
  clearAuthSession,
  isLoggedIn,
  loadAuthSession,
  loginAccount,
  logoutAccount,
  registerAccount,
} from "./authStore";
import { loadSavedPlayerName } from "./scoresStore";
import { ensureVernanDialogStyles, VERIFIED_GREEN } from "./dialogStyles";

type Tab = "login" | "register";

/** Opens account login / create-account. Resolves when the dialog closes. */
export function openLoginDialog(): Promise<void> {
  ensureVernanDialogStyles();
  return new Promise((resolve) => {
    let busy = false;
    let authMode: Tab = "login";

    const root = document.createElement("div");
    root.className = "vsd-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Account");

    const panel = document.createElement("div");
    panel.className = "vsd-panel vsd-panel-login";

    const accent = document.createElement("div");
    accent.className = "vsd-accent";
    accent.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "vsd-body";

    const title = document.createElement("h2");
    title.className = "vsd-title";
    title.textContent = "ACCOUNT";
    body.append(title);

    const tabs = document.createElement("div");
    tabs.className = "vsd-tabs vsd-tabs-2";
    tabs.setAttribute("role", "tablist");
    const tabLogin = tabButton("Log in", "login");
    const tabRegister = tabButton("Create Account", "register");
    tabs.append(tabLogin, tabRegister);

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

    const form = document.createElement("div");
    form.className = "vsd-form vsd-form-login";
    form.dataset.mode = "auth";

    const formHint = hintEl("Log in for a verified green name on the leaderboard.");

    const authDisplay = fieldBlock("Display name", "vernan-login-display", {
      maxLength: 20,
      placeholder: "Shown on leaderboard",
      value: guestNameDefault(),
    });
    const authUser = fieldBlock("Username", "vernan-login-user", {
      maxLength: 20,
      placeholder: "username",
      autocomplete: "username",
    });
    const authPass = fieldBlock("Password", "vernan-login-pass", {
      maxLength: 128,
      type: "password",
      autocomplete: "current-password",
    });

    const slot1 = document.createElement("div");
    slot1.className = "vsd-slot";
    slot1.append(authDisplay.wrap);
    const slot2 = document.createElement("div");
    slot2.className = "vsd-slot";
    slot2.append(authUser.wrap);
    const slot3 = document.createElement("div");
    slot3.className = "vsd-slot";
    slot3.append(authPass.wrap);

    const authFormAction = document.createElement("div");
    authFormAction.className = "vsd-form-action";
    const authActionBtn = btn("Log in", "primary");
    authFormAction.append(authActionBtn);

    form.append(formHint, slot1, slot2, slot3, document.createElement("div"), authFormAction);

    const actions = document.createElement("div");
    actions.className = "vsd-actions vsd-actions-1";
    const closeBtn = btn("Close", "secondary");
    actions.append(closeBtn);

    body.append(tabs, sessionEl, errorEl, form, actions);
    panel.append(accent, body);
    root.append(panel);
    document.body.append(root);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      root.remove();
      resolve();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    document.addEventListener("keydown", onKey);

    const setError = (msg: string | null) => {
      errorEl.textContent = msg && msg.trim() ? msg : "\u00a0";
    };

    const syncFieldInteractivity = () => {
      authDisplay.input.disabled = busy;
      authUser.input.disabled = busy;
      authPass.input.disabled = busy;
      authActionBtn.disabled = busy;
    };

    const syncSessionUi = () => {
      const session = loadAuthSession();
      const loggedIn = session != null;
      if (loggedIn && session) {
        sessionEl.dataset.empty = "false";
        sessionLabel.textContent = "Signed in";
        sessionName.textContent = session.displayName;
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
      closeBtn.disabled = busy;
      syncFieldInteractivity();
    };

    const setBusy = (next: boolean) => {
      busy = next;
      tabLogin.disabled = next;
      tabRegister.disabled = next;
      closeBtn.disabled = next;
      syncFieldInteractivity();
      if (!next) syncSessionUi();
    };

    const syncAuthPane = (mode: Tab) => {
      authMode = mode;
      const isRegister = mode === "register";
      formHint.textContent = isRegister
        ? "Username 3–20 letters/numbers/_ · password 8+."
        : "Log in for a verified green name on the leaderboard.";
      authActionBtn.textContent = isRegister ? "Create account" : "Log in";
      authPass.input.autocomplete = isRegister ? "new-password" : "current-password";
      authDisplay.input.placeholder = isRegister
        ? "Shown on leaderboard"
        : "Optional — used only when creating an account";
    };

    const showTab = (next: Tab) => {
      if (busy) return;
      setError(null);
      tabLogin.setAttribute("aria-selected", next === "login" ? "true" : "false");
      tabRegister.setAttribute("aria-selected", next === "register" ? "true" : "false");
      syncAuthPane(next);
      syncFieldInteractivity();
      authDisplay.input.focus();
    };

    const doLogout = async () => {
      if (busy || !isLoggedIn()) return;
      setBusy(true);
      await logoutAccount();
      clearAuthSession();
      setBusy(false);
      syncSessionUi();
      showTab("login");
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
        showTab("login");
      } catch (err) {
        setBusy(false);
        setError(err instanceof Error ? err.message : "Auth failed");
      }
    };

    closeBtn.addEventListener("click", () => finish());
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
    authUser.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void doAuth();
      }
    });

    tabLogin.addEventListener("click", () => {
      if (isLoggedIn()) {
        void doLogout();
        return;
      }
      showTab("login");
    });
    tabRegister.addEventListener("click", () => showTab("register"));

    syncSessionUi();
    showTab("login");
  });
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

function btn(label: string, kind: "primary" | "secondary"): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = kind === "primary" ? "vsd-btn vsd-btn-primary" : "vsd-btn";
  b.textContent = label;
  return b;
}

function guestNameDefault(): string {
  const n = loadSavedPlayerName();
  return n === "Anonymous" ? "" : n;
}
