import {
  installCrashHandlers,
  submitCrashReport,
} from "./diagnostics/crashReporter";
import { mount } from "./mount";

installCrashHandlers();

const root = document.querySelector("#vernan-root");
if (!(root instanceof HTMLElement)) {
  throw new Error("#vernan-root missing");
}

mount(root, {
  // Resolve against the page URL so GitHub Pages / subpath hosts work with Vite `base: "./"`.
  assetBase: new URL("assets/", window.location.href).href,
});

const reportBtn = document.querySelector("#report-crash-btn");
const reportStatus = document.querySelector("#report-crash-status");
if (reportBtn instanceof HTMLButtonElement) {
  reportBtn.addEventListener("click", () => {
    void (async () => {
      const note = window.prompt(
        "Describe what went wrong (optional). Seed/floor are included automatically.",
        "",
      );
      if (note === null) return;

      const message =
        note.trim() || "Player-reported issue (no details provided)";
      reportBtn.disabled = true;
      if (reportStatus instanceof HTMLElement) {
        reportStatus.textContent = "Sending…";
      }

      const ok = await submitCrashReport({
        message,
        stack: "",
        source: "manual",
      });

      if (reportStatus instanceof HTMLElement) {
        reportStatus.textContent = ok
          ? "Report sent — thanks."
          : "Could not send (API unavailable).";
      }
      reportBtn.disabled = false;
      window.setTimeout(() => {
        if (reportStatus instanceof HTMLElement) reportStatus.textContent = "";
      }, 4000);
    })();
  });
}
