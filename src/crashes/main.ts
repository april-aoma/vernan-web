import { listCrashes, type CrashEntry } from "../diagnostics/crashReporter";
import { formatUtcTimestamp } from "../ranking/scoresStore";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function playUrl(): string {
  const url = new URL("index.html", window.location.href);
  try {
    const api = new URLSearchParams(window.location.search).get("scoresApi");
    if (api) url.searchParams.set("scoresApi", api);
  } catch {
    /* ignore */
  }
  return url.href;
}

function metaBits(row: CrashEntry): string {
  const bits: string[] = [];
  bits.push(`<span class="crash-source">${escapeHtml(row.source || "unknown")}</span>`);
  bits.push(`<span>${escapeHtml(formatUtcTimestamp(row.createdAt))}</span>`);
  if (row.client) bits.push(`<span><strong>${escapeHtml(row.client)}</strong></span>`);
  if (row.seed !== null && row.seed !== undefined) {
    bits.push(`<span>seed <strong>${escapeHtml(String(row.seed))}</strong></span>`);
  }
  if (row.floorReached !== null && row.floorReached !== undefined) {
    bits.push(`<span>floor <strong>${escapeHtml(String(row.floorReached))}</strong></span>`);
  }
  return bits.join("");
}

function renderCrash(row: CrashEntry): string {
  const stack = row.stack?.trim()
    ? `<pre class="crash-stack">${escapeHtml(row.stack)}</pre>`
    : "";
  const ua = row.userAgent
    ? `<div class="crash-meta"><span title="${escapeHtml(row.userAgent)}">${escapeHtml(row.userAgent.slice(0, 120))}${row.userAgent.length > 120 ? "…" : ""}</span></div>`
    : "";
  const page = row.pageUrl
    ? `<div class="crash-meta"><span title="${escapeHtml(row.pageUrl)}">${escapeHtml(row.pageUrl.slice(0, 100))}${row.pageUrl.length > 100 ? "…" : ""}</span></div>`
    : "";
  return `
    <article class="crash">
      <div class="crash-meta">${metaBits(row)}</div>
      <p class="crash-message">${escapeHtml(row.message)}</p>
      ${stack}
      ${page}
      ${ua}
    </article>
  `;
}

function renderList(rows: CrashEntry[]): string {
  if (rows.length === 0) {
    return `<div class="empty">No crash reports yet.</div>`;
  }
  return rows.map(renderCrash).join("");
}

async function main(): Promise<void> {
  const root = document.getElementById("crash-list");
  if (!(root instanceof HTMLElement)) return;

  try {
    const rows = await listCrashes(50);
    root.innerHTML = renderList(rows);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load crash reports";
    root.innerHTML = `
      <div class="error" role="alert">
        <p>${escapeHtml(message)}</p>
        <p><a class="nav-btn" href="${escapeHtml(playUrl())}">Return to game</a></p>
      </div>
    `;
  }
}

void main();
