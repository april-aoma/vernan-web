import { renderCostumeIdleIcon } from "./costumeIdleIcon";
import { loadCostumeLayers } from "../ranking/costumeResolve";
import {
  formatUtcTimestamp,
  listScores,
  usingRemoteScores,
  usingRepoMirror,
} from "../ranking/scoresStore";
import type { ScoreEntry } from "../ranking/types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function playUrlForSeed(seed: number): string {
  const url = new URL("index.html", window.location.href);
  url.searchParams.set("seed", String(seed));
  try {
    const api = new URLSearchParams(window.location.search).get("scoresApi");
    if (api) url.searchParams.set("scoresApi", api);
  } catch {
    /* ignore */
  }
  return url.href;
}

function placeClass(rank: number): string {
  const parts: string[] = [];
  if (rank === 1) parts.push("place-1");
  else if (rank === 2) parts.push("place-2");
  else if (rank === 3) parts.push("place-3");
  if (rank <= 10) parts.push("top-ten");
  return parts.join(" ");
}

function rungHtml(): string {
  return `<div class="ladder-rung" aria-hidden="true"><span class="rail"></span><span class="bar"></span><span class="rail"></span></div>`;
}

function renderLadderSkeleton(rows: ScoreEntry[]): string {
  if (rows.length === 0) {
    return `${rungHtml()}
      <div class="ladder-bay" role="listitem">
        <span class="rail" aria-hidden="true"></span>
        <p class="empty">No scores yet.<br />Pause or die in-game, then Submit &amp; quit.</p>
        <span class="rail" aria-hidden="true"></span>
      </div>
      ${rungHtml()}`;
  }

  const parts: string[] = [rungHtml()];

  rows.forEach((r, i) => {
    const rank = i + 1;
    const delay = Math.min(i, 12) * 0.05;
    parts.push(`
      <div class="ladder-bay ${placeClass(rank)}" role="listitem" data-score-id="${escapeHtml(r.id)}">
        <span class="rail" aria-hidden="true"></span>
        <div class="score" style="animation-delay: ${delay}s">
          <span class="rank">#${rank}</span>
          <div class="score-main">
            <span class="player">${escapeHtml(r.playerName)}</span>
            <span class="stat">Fl <strong>${r.floorReached}</strong></span>
            <span class="stat">$ <strong>${r.coins}</strong></span>
            <span class="stat">Kills <strong>${r.enemiesKilled}</strong></span>
            <span class="stat client" title="Client">${escapeHtml(r.client || "—")}</span>
            <span class="stat seed">Seed <a href="${playUrlForSeed(r.seed)}" title="Replay this seed">${r.seed}</a></span>
          </div>
          <span class="time">${escapeHtml(formatUtcTimestamp(r.createdAt))}</span>
          <div class="costume" title="Costume">
            <img class="costume-icon" data-costume-for="${escapeHtml(r.id)}" alt="" width="${rank <= 10 ? 52 : 40}" height="${rank <= 10 ? 52 : 40}" />
          </div>
        </div>
        <span class="rail" aria-hidden="true"></span>
      </div>
      ${rungHtml()}
    `);
  });

  return parts.join("");
}

async function fillCostumeIcons(rows: ScoreEntry[]): Promise<void> {
  if (rows.length === 0) return;
  const layers = await loadCostumeLayers();

  const titleIcon = document.querySelector<HTMLImageElement>(".title-icon");
  if (titleIcon) {
    titleIcon.src = await renderCostumeIdleIcon(rows[0]!.itemIds ?? [], layers, 48);
    titleIcon.alt = `${rows[0]!.playerName} costume`;
  }

  await Promise.all(
    rows.map(async (r, i) => {
      const img = document.querySelector<HTMLImageElement>(
        `img[data-costume-for="${CSS.escape(r.id)}"]`,
      );
      if (!img) return;
      const size = i < 10 ? 52 : 40;
      img.src = await renderCostumeIdleIcon(r.itemIds ?? [], layers, size);
      img.alt = r.itemIds?.length ? "Run costume" : "Default Vernan";
    }),
  );
}

async function main(): Promise<void> {
  const ladder = document.getElementById("leaderboard-ladder");
  const meta = document.getElementById("board-meta");
  if (!(ladder instanceof HTMLElement)) return;

  if (meta) {
    if (usingRemoteScores()) {
      meta.textContent =
        "Ranked by floor, then coins, then kills. Showing the shared remote board.";
    } else if (usingRepoMirror()) {
      meta.textContent =
        "Ranked by floor, then coins, then kills. Shared scores load from the GitHub repo; this browser may also show unpublished local submits until data/scores.json is committed.";
    } else {
      meta.textContent =
        "Ranked by floor, then coins, then kills. Scores are stored in this browser.";
    }
  }

  try {
    const rows = await listScores(50);
    ladder.innerHTML = renderLadderSkeleton(rows);
    await fillCostumeIcons(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load scores";
    ladder.innerHTML = `${rungHtml()}
      <div class="ladder-bay">
        <span class="rail" aria-hidden="true"></span>
        <p class="error">${escapeHtml(msg)}</p>
        <span class="rail" aria-hidden="true"></span>
      </div>
      ${rungHtml()}`;
  }
}

void main();
