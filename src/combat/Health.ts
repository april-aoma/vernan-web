/**
 * Vernan HP: ordered heart containers (red, then soul/black).
 * Thin port of Java {@code game.combat.Health} player path.
 */
const ALIVE_EPS = 1e-9;

export enum HeartKind {
  RED = "RED",
  SOUL = "SOUL",
  BLACK = "BLACK",
}

type HeartContainer = {
  kind: HeartKind;
  capacity: number;
  fill: number;
  /** True once black HP contributed; black wins over soul when full. */
  blackContributed: boolean;
};

export class Health {
  private containers: HeartContainer[] = [];
  invulnRemaining = 0;
  private blackHeartsEmptiedPending = 0;

  constructor(redMax: number) {
    this.rebuildRedContainers(Math.max(1, redMax | 0), true);
  }

  /** Red half-heart cap (rounded). */
  get max(): number {
    return Math.round(this.redCapacityTotal());
  }

  set max(newRedMax: number) {
    this.setRedMaxWithoutHealing(Math.max(1, newRedMax | 0));
  }

  /** Total HP floored (red + soul + black). */
  get current(): number {
    return Math.floor(this.totalFill() + ALIVE_EPS);
  }

  /** Compat setter used by older heal paths — heals/drains red only toward value. */
  set current(v: number) {
    const target = Math.max(0, v);
    const red = this.redFillTotal();
    if (target > red) this.heal(Math.ceil(target - red));
    else if (target < red) this.drainRedFillFromRight(target);
  }

  get isInvulnerable(): boolean {
    return this.invulnRemaining > 0;
  }

  get isDead(): boolean {
    return this.totalFill() <= ALIVE_EPS;
  }

  /** True when red is full (world heart pickups ignore soul/black). */
  get isAtFullHealth(): boolean {
    return this.redFillTotal() + ALIVE_EPS >= this.redCapacityTotal();
  }

  update(dt: number): void {
    this.invulnRemaining = Math.max(0, this.invulnRemaining - dt);
  }

  heal(amount: number): void {
    if (amount <= 0) return;
    let remaining = amount;
    for (const c of this.containers) {
      if (c.kind !== HeartKind.RED || remaining <= ALIVE_EPS) continue;
      const room = c.capacity - c.fill;
      if (room <= ALIVE_EPS) continue;
      const add = Math.min(room, remaining);
      c.fill += add;
      remaining -= add;
    }
  }

  refill(): void {
    for (const c of this.containers) {
      if (c.kind === HeartKind.RED) c.fill = c.capacity;
    }
    this.invulnRemaining = 0;
  }

  tryDamage(amount: number, invulnSeconds: number): boolean {
    if (amount <= 0 || this.isDead || this.isInvulnerable) return false;
    this.applyContainerDamage(amount);
    this.invulnRemaining = Math.max(this.invulnRemaining, invulnSeconds);
    return true;
  }

  /** Damage without i-frame gate (Nephilim drink sip). */
  tryDamageIgnoringInvuln(amount: number): boolean {
    if (amount <= 0 || this.isDead) return false;
    this.applyContainerDamage(amount);
    return true;
  }

  consumeBlackHeartsEmptied(): number {
    const n = this.blackHeartsEmptiedPending;
    this.blackHeartsEmptiedPending = 0;
    return n;
  }

  setRedMaxWithoutHealing(newRedMax: number): void {
    this.rebuildRedContainers(Math.max(1, newRedMax), false);
    while (this.redFillTotal() > newRedMax + ALIVE_EPS) {
      this.drainRedFillFromRight(newRedMax);
    }
  }

  /** {@code containerCount} × 2 half-hearts of soul. */
  grantSoulHeartsFilled(containerCount: number): void {
    if (containerCount <= 0) return;
    this.grantSpecialHeartHp(containerCount * 2, HeartKind.SOUL);
  }

  /** {@code containerCount} × 2 half-hearts of black. */
  grantBlackHeartsFilled(containerCount: number): void {
    if (containerCount <= 0) return;
    this.grantSpecialHeartHp(containerCount * 2, HeartKind.BLACK);
  }

  clearSoulHearts(): void {
    this.containers = this.containers.filter((c) => c.kind !== HeartKind.SOUL);
  }

  clearBlackHearts(): void {
    this.containers = this.containers.filter((c) => c.kind !== HeartKind.BLACK);
  }

  hudSlotCount(): number {
    return Math.max(1, this.containers.length);
  }

  hudKind(slot: number): HeartKind {
    return this.containerAt(slot).kind;
  }

  hudFill(slot: number): number {
    return this.containerAt(slot).fill;
  }

  hudCapacity(slot: number): number {
    return this.containerAt(slot).capacity;
  }

  private containerAt(slot: number): HeartContainer {
    const c = this.containers[slot];
    if (!c) throw new Error(`heart slot ${slot}`);
    return c;
  }

  private applyContainerDamage(amount: number): void {
    this.blackHeartsEmptiedPending = 0;
    let remaining = amount;
    for (let i = this.containers.length - 1; i >= 0 && remaining > ALIVE_EPS; i--) {
      const c = this.containers[i]!;
      if (c.fill <= ALIVE_EPS) continue;
      const taken = Math.min(c.fill, remaining);
      c.fill -= taken;
      remaining -= taken;
      if (c.fill <= ALIVE_EPS) {
        if (c.kind === HeartKind.BLACK) this.blackHeartsEmptiedPending++;
        if (c.kind === HeartKind.RED) {
          c.fill = 0;
        } else {
          this.containers.splice(i, 1);
        }
      }
    }
  }

  private grantSpecialHeartHp(hp: number, grantKind: HeartKind): void {
    if (hp <= ALIVE_EPS) return;
    let remaining = hp;
    const start = this.redContainerCount();
    for (let i = start; i < this.containers.length && remaining > ALIVE_EPS; i++) {
      const c = this.containers[i]!;
      if (c.fill >= c.capacity - ALIVE_EPS) continue;
      const room = c.capacity - c.fill;
      const add = Math.min(room, remaining);
      this.applySpecialHeartFill(c, add, grantKind);
      remaining -= add;
    }
    while (remaining > ALIVE_EPS) {
      const c: HeartContainer = {
        kind: HeartKind.SOUL,
        capacity: 2,
        fill: 0,
        blackContributed: false,
      };
      const add = Math.min(c.capacity, remaining);
      this.applySpecialHeartFill(c, add, grantKind);
      this.containers.push(c);
      remaining -= add;
    }
  }

  private applySpecialHeartFill(c: HeartContainer, add: number, grantKind: HeartKind): void {
    if (add <= ALIVE_EPS) return;
    c.fill = Math.min(c.capacity, c.fill + add);
    if (grantKind === HeartKind.BLACK) c.blackContributed = true;
    this.finalizeSpecialKind(c);
  }

  private finalizeSpecialKind(c: HeartContainer): void {
    if (c.kind === HeartKind.RED) return;
    c.kind = c.blackContributed ? HeartKind.BLACK : HeartKind.SOUL;
  }

  private rebuildRedContainers(redMaxHalfHearts: number, fillNewRed: boolean): void {
    const targetSlots = Math.max(1, Math.ceil(redMaxHalfHearts / 2));
    let redEnd = this.redContainerCount();
    while (redEnd < targetSlots) {
      const cap = Math.min(2, redMaxHalfHearts - 2 * redEnd);
      this.containers.splice(redEnd, 0, {
        kind: HeartKind.RED,
        capacity: cap,
        fill: fillNewRed ? cap : 0,
        blackContributed: false,
      });
      redEnd++;
    }
    while (redEnd > targetSlots) {
      this.containers.splice(redEnd - 1, 1);
      redEnd--;
    }
    for (let i = 0; i < redEnd; i++) {
      const c = this.containers[i]!;
      const cap = Math.min(2, redMaxHalfHearts - 2 * i);
      c.fill = Math.min(c.fill, cap);
      if (c.capacity !== cap) {
        this.containers[i] = {
          kind: HeartKind.RED,
          capacity: cap,
          fill: c.fill,
          blackContributed: false,
        };
      }
    }
  }

  private redContainerCount(): number {
    let n = 0;
    for (const c of this.containers) {
      if (c.kind !== HeartKind.RED) break;
      n++;
    }
    return n;
  }

  private redCapacityTotal(): number {
    let sum = 0;
    for (const c of this.containers) {
      if (c.kind !== HeartKind.RED) break;
      sum += c.capacity;
    }
    return sum;
  }

  private redFillTotal(): number {
    let sum = 0;
    for (const c of this.containers) {
      if (c.kind !== HeartKind.RED) break;
      sum += c.fill;
    }
    return sum;
  }

  private totalFill(): number {
    let sum = 0;
    for (const c of this.containers) sum += c.fill;
    return sum;
  }

  private drainRedFillFromRight(redMaxHalfHearts: number): void {
    while (this.redFillTotal() > redMaxHalfHearts + ALIVE_EPS) {
      let drained = false;
      for (let i = this.redContainerCount() - 1; i >= 0; i--) {
        const c = this.containers[i]!;
        if (c.fill > ALIVE_EPS) {
          c.fill = Math.max(0, c.fill - 1);
          drained = true;
          break;
        }
      }
      if (!drained) break;
    }
  }
}
