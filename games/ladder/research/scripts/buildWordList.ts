/**
 * Generates packages/dictionary/src/data/puzzle-words.txt
 *
 * This is a dev/build script — run it whenever filtering criteria change:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/buildWordList.ts
 *
 * The output file is committed to the repo and loaded at runtime.
 * enable1.txt and commonWords.txt are only needed to regenerate it.
 */

import fs from 'fs';
import path from 'path';

import {
    loadDictionary,
    filterWords,
    filterBannedWords,
    loadCommonWords,
    filterCommonWords,
} from '@repo/dictionary';

const raw = loadDictionary();
const filtered = filterWords(raw);
const cleaned = filterBannedWords(filtered);
const common = loadCommonWords();
const final = filterCommonWords(cleaned, common);

// Keep only 4 and 5 letter words — the lengths this game will ever use.
const puzzleWords = final
    .filter((w) => w.length === 4 || w.length === 5)
    .sort();

const outputPath = path.join(
    process.cwd(),
    '../../packages/dictionary/src/data/puzzle-words.txt',
);

fs.writeFileSync(outputPath, puzzleWords.join('\n') + '\n', 'utf-8');

const count4 = puzzleWords.filter((w) => w.length === 4).length;
const count5 = puzzleWords.filter((w) => w.length === 5).length;

console.log(`Written ${puzzleWords.length} words to puzzle-words.txt`);
console.log(`  4-letter: ${count4}`);
console.log(`  5-letter: ${count5}`);
