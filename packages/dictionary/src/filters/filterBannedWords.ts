import { bannedWords } from './bannedWords';

export function filterBannedWords(words: string[]): string[] {
    return words.filter((word) => !bannedWords.has(word));
}
