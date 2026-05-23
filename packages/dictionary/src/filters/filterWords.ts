export function filterWords(words: string[]): string[] {
  return words.filter(word => {
    return (
      word.length >= 3 &&
      word.length <= 7 &&
      /^[A-Z]+$/.test(word)
    );
  });
}