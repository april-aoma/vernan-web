import type { RunSummary } from "./types";
import { loadSavedPlayerName, sanitizePlayerName } from "./scoresStore";

export type SubmitDialogResult =
  | { action: "submit"; playerName: string }
  | { action: "cancel" };

/**
 * Modal DOM form for opt-in run submit (name + confirm).
 * Returns a promise that resolves when the player chooses.
 */
export function openSubmitDialog(summary: RunSummary): Promise<SubmitDialogResult> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Submit run");
    Object.assign(backdrop.style, {
      position: "fixed",
      inset: "0",
      zIndex: "10000",
      display: "grid",
      placeItems: "center",
      background: "rgba(0,0,0,0.72)",
      padding: "16px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    } as CSSStyleDeclaration);

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(22rem, 100%)",
      background: "#12161c",
      color: "#d7dde5",
      border: "1px solid #3a4656",
      borderRadius: "8px",
      padding: "1.1rem 1.2rem",
      boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
    } as CSSStyleDeclaration);

    const title = document.createElement("h2");
    title.textContent = "Submit run";
    Object.assign(title.style, {
      margin: "0 0 0.75rem",
      fontSize: "1rem",
      fontWeight: "600",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "#9aa7b5",
    } as CSSStyleDeclaration);

    const stats = document.createElement("p");
    stats.textContent =
      `Floor ${summary.floorReached} · Coins ${summary.coins} · ` +
      `Kills ${summary.enemiesKilled} · Seed ${summary.seed}`;
    Object.assign(stats.style, {
      margin: "0 0 0.5rem",
      fontSize: "0.8rem",
      lineHeight: "1.45",
      color: "#7d8a98",
    } as CSSStyleDeclaration);

    const hint = document.createElement("p");
    hint.textContent =
      "Saves locally and downloads scores.json — replace vernan-web/data/scores.json and commit. The live site loads it from GitHub raw, not Pages.";
    Object.assign(hint.style, {
      margin: "0 0 1rem",
      fontSize: "0.7rem",
      lineHeight: "1.4",
      color: "#5c6b7a",
    } as CSSStyleDeclaration);

    const label = document.createElement("label");
    label.textContent = "Name";
    label.htmlFor = "vernan-submit-name";
    Object.assign(label.style, {
      display: "block",
      fontSize: "0.75rem",
      marginBottom: "0.35rem",
      color: "#9aa7b5",
    } as CSSStyleDeclaration);

    const input = document.createElement("input");
    input.id = "vernan-submit-name";
    input.type = "text";
    input.maxLength = 20;
    input.value = loadSavedPlayerName() === "Anonymous" ? "" : loadSavedPlayerName();
    input.placeholder = "Anonymous";
    input.autocomplete = "nickname";
    Object.assign(input.style, {
      width: "100%",
      boxSizing: "border-box",
      padding: "0.55rem 0.65rem",
      marginBottom: "1rem",
      borderRadius: "6px",
      border: "1px solid #3a4656",
      background: "#0b0d10",
      color: "#e8ecf1",
      font: "inherit",
      fontSize: "0.9rem",
    } as CSSStyleDeclaration);

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      gap: "0.5rem",
      justifyContent: "flex-end",
    } as CSSStyleDeclaration);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    styleBtn(cancelBtn, false);

    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.textContent = "Submit & quit";
    styleBtn(submitBtn, true);

    let settled = false;
    const finish = (result: SubmitDialogResult) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(result);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish({ action: "cancel" });
      }
    };

    cancelBtn.addEventListener("click", () => finish({ action: "cancel" }));
    submitBtn.addEventListener("click", () => {
      finish({
        action: "submit",
        playerName: sanitizePlayerName(input.value || "Anonymous"),
      });
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitBtn.click();
      }
    });

    actions.append(cancelBtn, submitBtn);
    panel.append(title, stats, hint, label, input, actions);
    backdrop.append(panel);
    document.body.append(backdrop);
    document.addEventListener("keydown", onKey);
    input.focus();
    input.select();
  });
}

function styleBtn(btn: HTMLButtonElement, primary: boolean): void {
  Object.assign(btn.style, {
    padding: "0.5rem 0.85rem",
    borderRadius: "6px",
    border: primary ? "1px solid #6ec8ff" : "1px solid #3a4656",
    background: primary ? "#1a3a52" : "#1a2332",
    color: primary ? "#d7eefc" : "#c8d2e6",
    font: "inherit",
    fontSize: "0.8rem",
    cursor: "pointer",
  } as CSSStyleDeclaration);
}
