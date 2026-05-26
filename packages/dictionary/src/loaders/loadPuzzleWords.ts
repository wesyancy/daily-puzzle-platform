import fs from 'fs';
import path from 'path';

/**
 * Loads the pre-built puzzle word list (4 and 5 letter words, pre-filtered,
 * profanity removed). This is the only file loaded at runtime.
 *
 * To regenerate this file after changing filter criteria or bannedWords, run:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/buildWordList.ts
 */
export function loadPuzzleWords(): string[] {
    const filePath = path.join(
        process.cwd(),
        '../../packages/dictionary/src/data/puzzle-words.txt',
    );

    return fs
        .readFileSync(filePath, 'utf-8')
        .split('\n')
        .map((w) => w.trim())
        .filter((w) => w.length > 0);
}
