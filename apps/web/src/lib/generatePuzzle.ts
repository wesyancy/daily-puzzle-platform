import fs from 'fs';
import path from 'path';
import { loadPuzzleWords, createWordSet, getNeighbors } from '@repo/dictionary';
import { bfsShortestPath, computeNeighborGraph } from '@repo/game-engine';
import { loadWordPairs } from '@/lib/loadWordPairs';

function loadBlocklist(file: string): Set<string> {
    const filePath = path.join(process.cwd(), '../../games/ladder/data', file);
    return new Set(
        fs
            .readFileSync(filePath, 'utf-8')
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith('#')),
    );
}

function randomItem<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
    return [...items].sort(() => Math.random() - 0.5);
}

/** COLD→WARM quality thresholds — must match validateWordPairs.ts */
const MIN_MOVES = 4;
const MAX_MOVES = 5;
const MIN_BRANCHING = 7;
const MIN_AVG_BRANCHING = 7;

/** Letters banned from puzzle start/target words. */
const RARE_LETTERS = new Set(['J', 'Z', 'V']);

function meetsQuality(
    p: string[],
    wordSet: Set<string>,
): boolean {
    const moves = p.length - 1;
    if (moves < MIN_MOVES || moves > MAX_MOVES) return false;

    const branches = p.map((w) => getNeighbors(w, wordSet).length);
    const avg = branches.reduce((s, n) => s + n, 0) / branches.length;
    const min = Math.min(...branches);

    return min >= MIN_BRANCHING && avg >= MIN_AVG_BRANCHING;
}

export function generatePuzzle() {
    const allWords = loadPuzzleWords();
    const wordSet = createWordSet(allWords);

    const blockedWords = loadBlocklist('blocked-words.txt');
    const blockedPairs = loadBlocklist('blocked-pairs.txt');

    function isPairBlocked(s: string, t: string): boolean {
        return (
            blockedWords.has(s) ||
            blockedWords.has(t) ||
            blockedPairs.has(`${s},${t}`) ||
            blockedPairs.has(`${t},${s}`)
        );
    }

    // ── Primary path: curated pairs ──────────────────────────────────────────
    const pairs = loadWordPairs().filter(
        ([s, t]) => wordSet.has(s) && wordSet.has(t) && !isPairBlocked(s, t),
    );

    for (const [start, target] of shuffle(pairs)) {
        const p = bfsShortestPath(start, target, wordSet);
        if (p && meetsQuality(p, wordSet)) {
            return {
                start,
                target,
                optimalPath: p,
                neighborGraph: computeNeighborGraph(start, wordSet),
            };
        }
    }

    // ── Fallback: random generation (research / before pairs are curated) ────
    const candidates = allWords.filter(
        (w) =>
            w.length === 4 &&
            ![...w].some((c) => RARE_LETTERS.has(c)) &&
            !blockedWords.has(w),
    );

    while (true) {
        const start = randomItem(candidates);
        const target = randomItem(candidates);

        if (start === target) continue;
        if (isPairBlocked(start, target)) continue;

        const p = bfsShortestPath(start, target, wordSet);

        if (!p || !meetsQuality(p, wordSet)) continue;

        return {
            start,
            target,
            optimalPath: p,
            neighborGraph: computeNeighborGraph(start, wordSet),
        };
    }
}
