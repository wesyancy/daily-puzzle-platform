const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function getNeighbors(
  word: string,
  wordSet: Set<string>
): string[] {
  const neighbors: string[] = [];

  for (let i = 0; i < word.length; i++) {
    for (const letter of ALPHABET) {
      if (letter === word[i]) continue;

      const candidate =
        word.slice(0, i) +
        letter +
        word.slice(i + 1);

      if (wordSet.has(candidate)) {
        neighbors.push(candidate);
      }
    }
  }

  return neighbors;
}