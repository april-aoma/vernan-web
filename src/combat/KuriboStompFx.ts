/** Squash/stretch tuning for Kuribo Shoe stomps (Java KuriboStompFx). */
export const KuriboStompFx = {
  VERNAN_IMPACT_X: 1.2,
  VERNAN_RELEASE_Y: 1.2,
  VERNAN_RELEASE_RECOVER_FRAMES: 15,
  ENEMY_IMPACT_X: 1.3,
  ENEMY_RELEASE_GROUNDED_Y: 1.1,
  ENEMY_RELEASE_RECOVER_FRAMES: 10,
  STOMP_CORPSE_X: 1.75,
  STOMP_CORPSE_LINGER_SEC: 2.0,
  STOMP_CORPSE_EXPLOSION_STAGGER_SEC: 0.08,
  STOMP_CORPSE_EXPLOSION_TAIL_SEC: 0.14,
  STOMP_CORPSE_EXPLOSION_HALF_SPREAD_PX: 9.0,
  CORPSE_SPAWN_POP_VY: -72.0,
} as const;

export function isKuriboStompKnockKind(
  kind: string,
): kind is "stomp" | "stomp_electric" {
  return kind === "stomp" || kind === "stomp_electric";
}
