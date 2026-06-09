/**
 * Generates packages/dictionary/src/data/puzzle-words.txt
 *
 * Pipeline: enable1.txt → filterWords → filterBannedWords → filterExcludedWords → puzzle-words.txt
 *
 * The commonWords allowlist has been removed in favour of a blocklist approach:
 * words are included by default and removed explicitly via excluded-words.txt.
 * This produces a much larger, more complete word set for gameplay.
 *
 * To run:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/buildWordList.ts
 *
 * After regenerating, re-run validateWordPairs.ts — branching factors will have changed.
 */

import fs from 'fs';
import path from 'path';

import {
    loadDictionary,
    filterWords,
    filterBannedWords,
} from '@repo/dictionary';

// Load the gameplay blocklist (words valid in English but bad as puzzle words)
const excludedWordsPath = path.join(
    process.cwd(),
    '../../games/ladder/data/excluded-words.txt',
);
const excludedWords = new Set(
    fs
        .readFileSync(excludedWordsPath, 'utf-8')
        .split('\n')
        .map((l) => l.trim().toUpperCase())
        .filter((l) => l.length > 0 && !l.startsWith('#')),
);

const raw = loadDictionary();
const filtered = filterWords(raw);
const cleaned = filterBannedWords(filtered);
const final = cleaned.filter((w) => !excludedWords.has(w));

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
console.log(`  Excluded: ${excludedWords.size} words from excluded-words.txt`);
