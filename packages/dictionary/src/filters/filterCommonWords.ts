export function filterCommonWords(
    words: string[],
    commonWords: Set<string>,
): string[] {
    return words.filter((word) => commonWords.has(word));
}
