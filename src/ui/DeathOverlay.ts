import type { RunSummary } from "../ranking/types";
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from "../specs";

export type DeathOverlayHitRect = { x: number; y: number; w: number; h: number };

export type DeathOverlayHitRects = {
  submit: DeathOverlayHitRect;
  viewBoard: DeathOverlayHitRect;
  restartNew: DeathOverlayHitRect;
  retrySame: DeathOverlayHitRect;
};

const EMPTY: DeathOverlayHitRect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Death / game-over overlay: keeps the web YOU DIED panel and adds Java GamePanel
 * game-over actions (submit, view board, new seed, same seed).
 * Z/X room retry is handled by mount.
 */
export function drawDeathOverlay(
  g: CanvasRenderingContext2D,
  summary: RunSummary,
  submitLocked = false,
): DeathOverlayHitRects {
  // Java drawGameOverOverlay: full-frame dim α 190.
  g.fillStyle = "rgba(0,0,0,0.745)";
  g.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

  const boxW = 280;
  const boxH = 198;
  const boxX = Math.floor((INTERNAL_WIDTH - boxW) / 2);
  const boxY = Math.floor(INTERNAL_HEIGHT * 0.5 - boxH / 2) - 8;

  g.fillStyle = "rgba(10,12,16,0.92)";
  g.fillRect(boxX, boxY, boxW, boxH);
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

  let y = boxY + 22;
  g.fillStyle = "#e8eef5";
  g.font = "14px monospace";
  const title = "YOU DIED";
  g.fillText(title, boxX + (boxW - g.measureText(title).width) / 2, y);

  y += 20;
  g.fillStyle = "#9aa7b5";
  g.font = "10px monospace";
  const line1 = `Fl ${summary.floorReached}  $ ${summary.coins}  Kills ${summary.enemiesKilled}/${summary.enemiesKillDifficulty}`;
  g.fillText(line1, boxX + (boxW - g.measureText(line1).width) / 2, y);

  y += 14;
  const line2 = `Seed ${summary.seed}`;
  g.fillText(line2, boxX + (boxW - g.measureText(line2).width) / 2, y);

  y += 18;
  g.fillStyle = "#c8d2e6";
  const retry = "Z/X — retry room";
  g.fillText(retry, boxX + (boxW - g.measureText(retry).width) / 2, y);

  y += 10;
  const btnW = boxW - 24;
  const btnX = boxX + 12;
  let submit: DeathOverlayHitRect = EMPTY;

  if (submitLocked) {
    g.fillStyle = "#a07878";
    g.font = "10px monospace";
    const locked = "Submit locked (not leaderboard-viable)";
    g.fillText(locked, boxX + (boxW - g.measureText(locked).width) / 2, y + 12);
    y += 18;
  } else {
    submit = drawAccentButton(g, btnX, y, btnW, 16, "Q — Submit & quit", "rgba(120,170,255,0.18)", "rgb(120,170,255)");
    y += 22;
  }

  const viewBoard = drawAccentButton(
    g,
    btnX,
    y,
    btnW,
    16,
    "VIEW LEADERBOARD",
    "rgba(180,190,210,0.18)",
    "rgb(180,190,210)",
  );
  y += 28;

  const restartW = 210;
  const restartX = boxX + Math.floor((boxW - restartW) / 2);
  const restartNew = drawOutlineButton(g, restartX, y, restartW, 22, "RESTART (NEW SEED)", 200, 60);
  y += 32;

  const retryW = 170;
  const retryX = boxX + Math.floor((boxW - retryW) / 2);
  const retrySame = drawOutlineButton(g, retryX, y, retryW, 18, "RETRY (SAME SEED)", 180, 45);

  return { submit, viewBoard, restartNew, retrySame };
}

function drawAccentButton(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  fill: string,
  stroke: string,
): DeathOverlayHitRect {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  g.strokeStyle = stroke;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.fillStyle = "#ffffff";
  g.font = "10px monospace";
  g.fillText(label, x + (w - g.measureText(label).width) / 2, y + h * 0.5 + 3.5);
  return { x, y, w, h };
}

/** Java restart / retry outline buttons. */
function drawOutlineButton(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  strokeA: number,
  fillA: number,
): DeathOverlayHitRect {
  g.strokeStyle = `rgba(255,255,255,${strokeA / 255})`;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.fillStyle = `rgba(255,255,255,${fillA / 255})`;
  g.fillRect(x + 1, y + 1, w - 1, h - 1);
  g.fillStyle = strokeA >= 200 ? "#ffffff" : "rgba(255,255,255,0.86)";
  g.font = "10px monospace";
  g.fillText(label, x + (w - g.measureText(label).width) / 2, y + h * 0.5 + 3.5);
  return { x, y, w, h };
}
