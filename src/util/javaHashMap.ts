/**
 * OpenJDK {@code HashMap}/{@code HashSet} key iteration (capacity-16 default path).
 * Used where Java iterates {@code new HashSet<>(map.keySet())} and order affects RNG shuffles.
 */

/** Java {@code String.hashCode}. */
export function javaStringHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** Java {@code HashMap.hash}: {@code hashCode ^ (hashCode >>> 16)}. */
export function javaHashMapHash(key: string): number {
  const h = javaStringHashCode(key);
  return (h ^ (h >>> 16)) | 0;
}

function tableSizeFor(cap: number): number {
  let n = -1 >>> Math.clz32(Math.max(0, cap - 1) | 0);
  if (n < 0) return 1;
  if (n >= 1 << 30) return 1 << 30;
  return n + 1;
}

type Node = { key: string; next: Node | null };

/**
 * Keys in the order of {@code new HashSet<>(keys).iterator()} when {@code keys} is
 * already in {@code HashMap.keySet()} order — or, equivalently for the usual
 * capacity-16 dungeon cell map, after inserting {@code keysInInsertionOrder} into
 * a default {@code HashMap} then copying into {@code new HashSet<>(keySet)}.
 *
 * For secret placement we pass room keys in insertion order (JS {@code Map} order).
 */
export function javaHashSetIterationOrder(keysInInsertionOrder: Iterable<string>): string[] {
  const inserted = [...keysInInsertionOrder];
  // Default HashMap puts (dungeon cell map).
  const cellOrder = hashMapKeySetOrder(inserted, 16);
  // HashSet(Collection): initialCapacity = max((int)(size/0.75)+1, 16).
  const initialCapacity = Math.max(((inserted.length / 0.75) | 0) + 1, 16);
  return hashMapKeySetOrder(cellOrder, initialCapacity);
}

function hashMapKeySetOrder(keysInPutOrder: string[], initialCapacity: number): string[] {
  const cap = tableSizeFor(initialCapacity);
  const loadFactor = 0.75;
  let threshold = (cap * loadFactor) | 0;
  let table: (Node | null)[] = new Array(cap).fill(null);
  let size = 0;
  let capacity = cap;

  const resize = (): void => {
    const oldTab = table;
    const oldCap = capacity;
    const newCap = oldCap << 1;
    const newTab: (Node | null)[] = new Array(newCap).fill(null);
    for (let j = 0; j < oldCap; j++) {
      let e = oldTab[j];
      if (!e) continue;
      oldTab[j] = null;
      if (!e.next) {
        newTab[javaHashMapHash(e.key) & (newCap - 1)] = e;
      } else {
        let loHead: Node | null = null;
        let loTail: Node | null = null;
        let hiHead: Node | null = null;
        let hiTail: Node | null = null;
        let next: Node | null;
        do {
          next = e.next;
          if ((javaHashMapHash(e.key) & oldCap) === 0) {
            if (!loTail) loHead = e;
            else loTail.next = e;
            loTail = e;
          } else {
            if (!hiTail) hiHead = e;
            else hiTail.next = e;
            hiTail = e;
          }
          e = next!;
        } while (e);
        if (loTail) {
          loTail.next = null;
          newTab[j] = loHead;
        }
        if (hiTail) {
          hiTail.next = null;
          newTab[j + oldCap] = hiHead;
        }
      }
    }
    table = newTab;
    capacity = newCap;
    threshold = (newCap * loadFactor) | 0;
  };

  for (const key of keysInPutOrder) {
    if (size + 1 > threshold) resize();
    const hash = javaHashMapHash(key);
    const i = (capacity - 1) & hash;
    let p = table[i];
    if (!p) {
      table[i] = { key, next: null };
      size++;
      continue;
    }
    let exists = false;
    for (;;) {
      if (p.key === key) {
        exists = true;
        break;
      }
      if (!p.next) {
        p.next = { key, next: null };
        size++;
        break;
      }
      p = p.next;
    }
    if (exists) continue;
  }

  const out: string[] = [];
  for (let i = 0; i < capacity; i++) {
    for (let e = table[i]; e; e = e.next) out.push(e.key);
  }
  return out;
}
