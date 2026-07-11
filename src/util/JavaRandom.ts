/** Truncate to Java {@code long} bit width (two's complement 64-bit). */
export function toJavaLong(x: bigint | number): bigint {
  return BigInt.asIntN(64, typeof x === "bigint" ? x : BigInt(x));
}

/**
 * java.util.Random-compatible LCG (48-bit seed, same multipliers as OpenJDK).
 * Required so seeded dungeon generation can match the desktop client.
 *
 * @see https://docs.oracle.com/javase/8/docs/api/java/util/Random.html
 */
export class JavaRandom {
  private seed: bigint;

  constructor(seed: number | bigint = Date.now()) {
    this.seed = (toJavaLong(seed) ^ 0x5deece66dn) & ((1n << 48n) - 1n);
  }

  /** Matches `Random.setSeed`. */
  setSeed(seed: number | bigint): void {
    this.seed = (toJavaLong(seed) ^ 0x5deece66dn) & ((1n << 48n) - 1n);
  }

  private next(bits: number): number {
    this.seed = (this.seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
    return Number(this.seed >> (48n - BigInt(bits)));
  }

  nextInt(bound?: number): number {
    if (bound === undefined) {
      return this.next(32) | 0;
    }
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new Error(`bound must be positive integer, got ${bound}`);
    }
    if ((bound & -bound) === bound) {
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }
    let bits: number;
    let val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0);
    return val;
  }

  nextLong(): bigint {
    // Java: ((long) next(32) << 32) + next(32) — both halves are signed ints.
    const hi = this.next(32) | 0;
    const lo = this.next(32) | 0;
    return toJavaLong((BigInt(hi) << 32n) + BigInt(lo));
  }

  nextBoolean(): boolean {
    return this.next(1) !== 0;
  }

  nextFloat(): number {
    return this.next(24) / (1 << 24);
  }

  nextDouble(): number {
    const hi = BigInt(this.next(26));
    const lo = BigInt(this.next(27));
    return Number((hi << 27n) + lo) / Number(1n << 53n);
  }
}
