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
  if (rank === 1) return "place-1";
  if (rank === 2) return "place-2";
  if (rank === 3) return "place-3";
  return "";
}

function renderRows(rows: ScoreEntry[]): string {
  if (rows.length === 0) {
    return `<tr><td colspan="7" class="empty">No scores yet.<br />Pause in-game (or die) and choose Submit &amp; quit.</td></tr>`;
  }
  return rows
    .map((r, i) => {
      const rank = i + 1;
      const delay = Math.min(i, 12) * 0.04;
      return `
    <tr class="row-enter ${placeClass(rank)}" style="animation-delay: ${delay}s">
      <td class="rank">${rank}</td>
      <td class="player">${escapeHtml(r.playerName)}</td>
      <td class="num">${r.floorReached}</td>
      <td class="num">${r.coins}</td>
      <td class="num">${r.enemiesKilled}</td>
      <td class="seed"><a href="${playUrlForSeed(r.seed)}" title="Replay this seed">${r.seed}</a></td>
      <td class="time">${escapeHtml(formatUtcTimestamp(r.createdAt))}</td>
    </tr>`;
    })
    .join("");
}

async function main(): Promise<void> {
  const tbody = document.getElementById("leaderboard-body");
  const meta = document.getElementById("board-meta");
  if (!(tbody instanceof HTMLElement)) return;

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
    tbody.innerHTML = renderRows(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load scores";
    tbody.innerHTML = `<tr><td colspan="7" class="error">${escapeHtml(msg)}</td></tr>`;
  }
}

void main();
