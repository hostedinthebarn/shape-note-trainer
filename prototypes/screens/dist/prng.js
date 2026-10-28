// Neighbour module (written by Claude). A small seeded PRNG so exercises are reproducible.

/** mulberry32: returns a function giving floats in [0, 1), deterministic for a given 32-bit seed. */
export function mulberry32(seed        )               {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
