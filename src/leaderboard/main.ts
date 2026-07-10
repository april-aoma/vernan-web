import { renderCostumeIdleIcon } from "./costumeIdleIcon";
import { loadCostumeLayers } from "../ranking/costumeResolve";
import {
  defaultSortDir,
  sortScores,
  TOTAL_SCORE_FORMULA,
  totalScore,
  type SortDir,
  type SortKey,
} from "../ranking/scoreMath";
import {
  formatUtcTimestamp,
  LeaderboardConnectionError,
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

function playUrlForSeed(seed: number): string {
  const url = new URL(playUrl());
  url.searchParams.set("seed", String(seed));
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

function renderConnectionError(message: string): string {
  return `
    <div class="connection-error" role="alert">
      <p class="connection-title">No connection</p>
      <p class="connection-body">${escapeHtml(message)}</p>
      <a class="nav-btn connection-return" href="${escapeHtml(playUrl())}">Return to game</a>
    </div>
  `;
}

function sortIndicator(key: SortKey, active: SortKey, dir: SortDir): string {
  if (key !== active) return `<span class="sort-ind" aria-hidden="true"></span>`;
  return `<span class="sort-ind" aria-hidden="true">${dir === "asc" ? "▲" : "▼"}</span>`;
}

function headerButton(
  key: SortKey,
  label: string,
  active: SortKey,
  dir: SortDir,
  extraClass = "",
  title?: string,
): string {
  const pressed = key === active ? "true" : "false";
  const tip = title ? ` title="${escapeHtml(title)}"` : "";
  return `<button type="button" class="col-head ${extraClass}" data-sort="${key}" aria-pressed="${pressed}"${tip}>${escapeHtml(label)}${sortIndicator(key, active, dir)}</button>`;
}

function renderHeader(active: SortKey, dir: SortDir): string {
  return `
    <div class="ladder-bay ladder-header" role="row">
      <span class="rail" aria-hidden="true"></span>
      <div class="score score-cols score-header" role="row">
        ${headerButton("rank", "#", active, dir, "col-rank")}
        ${headerButton("name", "Name", active, dir, "col-name")}
        ${headerButton("total", "Score", active, dir, "col-total", TOTAL_SCORE_FORMULA)}
        ${headerButton("floor", "Fl", active, dir, "col-floor")}
        ${headerButton("coins", "$", active, dir, "col-coins")}
        ${headerButton("kills", "Kills", active, dir, "col-kills")}
        ${headerButton("client", "Client", active, dir, "col-client")}
        ${headerButton("seed", "Seed", active, dir, "col-seed")}
        ${headerButton("time", "Time", active, dir, "col-time")}
        <span class="col-costume" aria-hidden="true"></span>
      </div>
      <span class="rail" aria-hidden="true"></span>
    </div>
  `;
}

function renderRow(r: ScoreEntry, rank: number, delay: number): string {
  const tot = totalScore(r);
  return `
    <div class="ladder-bay ${placeClass(rank)}" role="listitem" data-score-id="${escapeHtml(r.id)}">
      <span class="rail" aria-hidden="true"></span>
      <div class="score score-cols" style="animation-delay: ${delay}s">
        <span class="col-rank rank">#${rank}</span>
        <span class="col-name player">${escapeHtml(r.playerName)}</span>
        <span class="col-total total-score" tabindex="0" title="${escapeHtml(TOTAL_SCORE_FORMULA)}" data-tip="${escapeHtml(TOTAL_SCORE_FORMULA)}"><strong>${tot}</strong></span>
        <span class="col-floor stat"><strong>${r.floorReached}</strong></span>
        <span class="col-coins stat"><strong>${r.coins}</strong></span>
        <span class="col-kills stat"><strong>${r.enemiesKilled}</strong></span>
        <span class="col-client stat client" title="Client">${escapeHtml(r.client || "—")}</span>
        <span class="col-seed stat seed"><a href="${playUrlForSeed(r.seed)}" title="Replay this seed">${r.seed}</a></span>
        <span class="col-time time">${escapeHtml(formatUtcTimestamp(r.createdAt))}</span>
        <div class="col-costume costume" title="Costume">
          <img class="costume-icon" data-costume-for="${escapeHtml(r.id)}" alt="" width="${rank <= 10 ? 52 : 40}" height="${rank <= 10 ? 52 : 40}" />
        </div>
      </div>
      <span class="rail" aria-hidden="true"></span>
    </div>
  `;
}

function renderLadder(rows: ScoreEntry[], sortKey: SortKey, sortDir: SortDir): string {
  if (rows.length === 0) {
    return `${rungHtml()}
      <div class="ladder-bay" role="listitem">
        <span class="rail" aria-hidden="true"></span>
        <p class="empty">No scores yet.<br />Pause or die in-game, then Submit &amp; quit.</p>
        <span class="rail" aria-hidden="true"></span>
      </div>
      ${rungHtml()}`;
  }

  const sorted = sortScores(rows, sortKey, sortDir);
  const parts: string[] = [rungHtml(), renderHeader(sortKey, sortDir), rungHtml()];
  sorted.forEach((r, i) => {
    const rank = i + 1;
    parts.push(renderRow(r, rank, Math.min(i, 12) * 0.05));
    parts.push(rungHtml());
  });
  return parts.join("");
}

async function fillCostumeIcons(rows: ScoreEntry[]): Promise<void> {
  if (rows.length === 0) return;
  const layers = await loadCostumeLayers();

  const titleIcon = document.querySelector<HTMLImageElement>(".title-icon");
  if (titleIcon) {
    const top = sortScores(rows, "total", "desc")[0];
    if (top) {
      titleIcon.src = await renderCostumeIdleIcon(top.itemIds ?? [], layers, 48);
      titleIcon.alt = `${top.playerName} costume`;
    }
  }

  await Promise.all(
    rows.map(async (r) => {
      const img = document.querySelector<HTMLImageElement>(
        `img[data-costume-for="${CSS.escape(r.id)}"]`,
      );
      if (!img) return;
      const bay = img.closest(".ladder-bay");
      const size = bay?.classList.contains("top-ten") ? 52 : 40;
      img.src = await renderCostumeIdleIcon(r.itemIds ?? [], layers, size);
      img.alt = r.itemIds?.length ? "Run costume" : "Default Vernan";
    }),
  );
}

function isSortKey(v: string): v is SortKey {
  return (
    v === "rank" ||
    v === "name" ||
    v === "total" ||
    v === "floor" ||
    v === "coins" ||
    v === "kills" ||
    v === "client" ||
    v === "seed" ||
    v === "time"
  );
}

async function main(): Promise<void> {
  const ladder = document.getElementById("leaderboard-ladder");
  const meta = document.getElementById("board-meta");
  if (!(ladder instanceof HTMLElement)) return;

  if (meta) {
    if (usingRemoteScores()) {
      meta.textContent =
        "Click a column to sort. Score = Floor + Kills + $. Showing the shared remote board.";
    } else if (usingRepoMirror()) {
      meta.textContent =
        "Click a column to sort. Score = Floor + Kills + $. Shared scores load from the GitHub repo; this browser may also show unpublished local submits.";
    } else {
      meta.textContent =
        "Click a column to sort. Score = Floor + Kills + $. Scores are stored in this browser.";
    }
  }

  let allRows: ScoreEntry[] = [];
  let sortKey: SortKey = "total";
  let sortDir: SortDir = "desc";

  const paint = async () => {
    ladder.innerHTML = renderLadder(allRows, sortKey, sortDir);
    await fillCostumeIcons(allRows);
  };

  ladder.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest?.("button[data-sort]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const key = btn.dataset.sort;
    if (!key || !isSortKey(key)) return;
    if (key === sortKey) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = defaultSortDir(key);
    }
    void paint();
  });

  try {
    allRows = await listScores(50);
    await paint();
  } catch (err) {
    const offline =
      err instanceof LeaderboardConnectionError ||
      (err instanceof Error && /abort|network|failed to fetch/i.test(err.message));
    const message = offline
      ? "No connection — leaderboard cannot be accessed."
      : err instanceof Error
        ? err.message
        : "Failed to load scores";
    if (meta) {
      meta.textContent = offline ? "Unable to reach the scores server." : "Something went wrong.";
    }
    ladder.classList.add("ladder-error");
    ladder.innerHTML = offline
      ? renderConnectionError(message)
      : `${rungHtml()}
      <div class="ladder-bay">
        <span class="rail" aria-hidden="true"></span>
        <p class="error">${escapeHtml(message)}</p>
        <span class="rail" aria-hidden="true"></span>
      </div>
      ${rungHtml()}
      <div class="connection-error-actions">
        <a class="nav-btn connection-return" href="${escapeHtml(playUrl())}">Return to game</a>
      </div>`;
  }
}

void main();
