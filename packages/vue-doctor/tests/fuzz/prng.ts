/** Small deterministic PRNG (mulberry32): the same seed always yields the same sequence. */
export interface Random {
  /** Float in [0, 1). */
  next: () => number;
  /** Integer in [0, maxExclusive). */
  int: (maxExclusive: number) => number;
  pick: <Item>(items: readonly Item[]) => Item;
  chance: (probability: number) => boolean;
}

export const createRandom = (seed: number): Random => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability,
  };
};

/** A stable 32-bit hash of a string, to derive a per-input seed that does not depend on input order. */
export const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
};
