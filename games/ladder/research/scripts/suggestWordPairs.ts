/**
 * Queries the Datamuse API to suggest semantically related word pairs
 * (antonyms + associations), then validates them against the game graph.
 *
 * Output: games/ladder/data/suggested-pairs.txt
 * Review this file, then copy good pairs to word-pairs.txt and re-run
 * validateWordPairs.ts to confirm they pass.
 *
 * Usage:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/suggestWordPairs.ts
 */

import fs from 'fs';
import path from 'path';

import {
    loadPuzzleWords,
    createWordSet,
    getNeighbors,
} from '@repo/dictionary';

import { bfsShortestPath } from '@repo/game-engine';

// ── Quality thresholds (must match validateWordPairs.ts) ─────────────────────
const MIN_MOVES = 4;
const MAX_MOVES = 5;
const MIN_BRANCHING_FACTOR = 5;
const MIN_AVG_BRANCHING = 7;
// ────────────────────────────────────────────────────────────────────────────

const DELAY_MS = 60; // be polite to the Datamuse API

const words = loadPuzzleWords().filter((w) => w.length === 4);
const wordSet = createWordSet(loadPuzzleWords());

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRelated(
    word: string,
    rel: 'rel_ant' | 'rel_trg',
): Promise<string[]> {
    try {
        const url = `https://api.datamuse.com/words?${rel}=${word.toLowerCase()}&max=20`;
        const res = await fetch(url);
        const data = (await res.json()) as { word: string }[];
        return data.map((d) => d.word.toUpperCase());
    } catch {
        return [];
    }
}

function meetsQuality(start: string, target: string): {
    pass: boolean;
    moves?: number;
    avgBranching?: number;
    minBranching?: number;
} {
    const p = bfsShortestPath(start, target, wordSet);
    if (!p) return { pass: false };

    const moves = p.length - 1;
    if (moves < MIN_MOVES || moves > MAX_MOVES) return { pass: false };

    const branches = p.map((w) => getNeighbors(w, wordSet).length);
    const avg = Math.round((branches.reduce((s, n) => s + n, 0) / branches.length) * 10) / 10;
    const min = Math.min(...branches);

    if (min < MIN_BRANCHING_FACTOR || avg < MIN_AVG_BRANCHING) return { pass: false };

    return { pass: true, moves, avgBranching: avg, minBranching: min };
}

async function main() {
    const seen = new Set<string>();
    const suggestions: string[] = [];

    console.log(`Querying Datamuse for ${words.length} words…`);

    for (let i = 0; i < words.length; i++) {
        const word = words[i];

        if (i % 50 === 0) {
            console.log(`  ${i}/${words.length}…`);
        }

        const antonyms = await fetchRelated(word, 'rel_ant');
        await sleep(DELAY_MS);

        const triggers = await fetchRelated(word, 'rel_trg');
        await sleep(DELAY_MS);

        const candidates = [...new Set([...antonyms, ...triggers])];

        for (const related of candidates) {
            if (related.length !== 4) continue;
            if (!wordSet.has(related)) continue;
            if (related === word) continue;

            // Normalise pair order so A,B and B,A are treated as the same
            const key = [word, related].sort().join(',');
            if (seen.has(key)) continue;
            seen.add(key);

            const q = meetsQuality(word, related);
            if (!q.pass) continue;

            suggestions.push(
                `${word},${related}  # moves=${q.moves} avg=${q.avgBranching} min=${q.minBranching}`,
            );
        }
    }

    const outputPath = path.join(process.cwd(), 'data/suggested-pairs.txt');
    const header = [
        '# Datamuse-suggested pairs — review and copy good ones to word-pairs.txt',
        '# Then run: validateWordPairs.ts',
        '# Format: START,TARGET  # metrics',
        '',
    ].join('\n');

    fs.writeFileSync(outputPath, header + suggestions.join('\n') + '\n', 'utf-8');

    console.log(`\nDone. ${suggestions.length} suggestions written to data/suggested-pairs.txt`);
}

main();
