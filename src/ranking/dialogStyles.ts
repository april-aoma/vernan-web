/** Shared chrome for submit / account dialogs. */

/** Matches Java verified-name green. */
export const VERIFIED_GREEN = "#5dcf6e";

const STYLE_ID = "vernan-submit-dialog-css";

export function ensureVernanDialogStyles(): void {
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

    .vsd-panel-login {
      height: 28rem;
    }
    .vsd-tabs-2 {
      grid-template-columns: repeat(2, 1fr);
    }
    .vsd-form-login[data-mode="auth"] .vsd-form-action {
      visibility: visible;
      pointer-events: auto;
    }
    .vsd-actions-1 {
      grid-template-columns: 1fr;
    }
  `;
}
