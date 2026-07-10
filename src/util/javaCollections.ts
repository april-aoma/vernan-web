import type { JavaRandom } from "./JavaRandom";

/** Matches {@code Collections.shuffle(list, rnd)} (Fisher–Yates with {@code nextInt(i)}). */
export function javaShuffle<T>(list: T[], rng: JavaRandom): void {
  for (let i = list.length; i > 1; i--) {
    const j = rng.nextInt(i);
    const tmp = list[i - 1]!;
    list[i - 1] = list[j]!;
    list[j] = tmp;
  }
}
