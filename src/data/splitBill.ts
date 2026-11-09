// Split bill arithmetic (amélioration 08), shared by the server and the register.

/** Equal shares to the millime; the remainder goes to the first parts (10,000 / 3 → 3,334 + 3,333 + 3,333). */
export const equalShares = (total: number, count: number): number[] => {
  const base = Math.floor(total / count);
  const rest = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rest ? 1 : 0));
};
