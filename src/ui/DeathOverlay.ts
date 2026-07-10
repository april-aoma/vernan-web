import type { RunSummary } from "../ranking/types";
import { INTERNAL_WIDTH, WORLD_VIEWPORT_H } from "../specs";

export type DeathOverlayHitRects = {
  submit: { x: number; y: number; w: number; h: number };
};

/**
 * Dim playfield + death summary with opt-in submit & quit.
 * Z/X still retry the room (handled by mount).
 */
export function drawDeathOverlay(
  g: CanvasRenderingContext2D,
  summary: RunSummary,
): DeathOverlayHitRects {
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(0, 0, INTERNAL_WIDTH, WORLD_VIEWPORT_H);

  const boxW = 280;
  const boxH = 118;
  const boxX = Math.floor((INTERNAL_WIDTH - boxW) / 2);
  const boxY = Math.floor(WORLD_VIEWPORT_H * 0.5 - boxH / 2);

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
  const btnH = 16;
  const btnX = boxX + 12;
  const btnY = y;
  g.fillStyle = "rgba(30, 90, 130, 0.85)";
  g.fillRect(btnX, btnY, btnW, btnH);
  g.strokeStyle = "rgba(110, 200, 255, 0.55)";
  g.strokeRect(btnX + 0.5, btnY + 0.5, btnW - 1, btnH - 1);
  g.fillStyle = "#d7eefc";
  g.font = "10px monospace";
  const submitLabel = "Q — Submit & quit";
  g.fillText(submitLabel, btnX + (btnW - g.measureText(submitLabel).width) / 2, btnY + 12);

  return { submit: { x: btnX, y: btnY, w: btnW, h: btnH } };
}
