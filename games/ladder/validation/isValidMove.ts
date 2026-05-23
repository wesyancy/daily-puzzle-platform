export function isValidMove(
  current: string,
  next: string,
  wordSet: Set<string>
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  if (!wordSet.has(next)) {
    return false;
  }

  let differences = 0;

  for (let i = 0; i < current.length; i++) {
    if (current[i] !== next[i]) {
      differences++;
    }
  }

  return differences === 1;
}