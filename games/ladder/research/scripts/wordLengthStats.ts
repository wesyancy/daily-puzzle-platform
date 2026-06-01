/**
 * Reports branching factor and puzzle potential statistics for 3, 4, and 5
 * letter word sets to inform whether to expand the game to new word lengths.
 *
 * Usage:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/wordLengthStats.ts
 */

import {
    loadPuzzleWords,
    loadDictionary,
    loadCommonWords,
    filterBannedWords,
    filterCommonWords,
    createWordSet,
    getNeighbors,
} from '@repo/dictionary';
import { bfsShortestPath } from '@repo/game-engine';

const SAMPLE_BRANCHING = 300;
const SAMPLE_PAIRS = 300;

function randomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function stats(nums: number[]) {
    if (nums.length === 0) return { min: 0, max: 0, avg: 0, median: 0 };
    const sorted = [...nums].sort((a, b) => a - b);
    const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
    return {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: Math.round(avg * 10) / 10,
        median: sorted[Math.floor(sorted.length / 2)],
    };
}

function analyseLength(label: string, words: string[]) {
    const wordSet = createWordSet(words);

    console.log(`\n${'═'.repeat(58)}`);
    console.log(` ${label}`);
    console.log(`${'═'.repeat(58)}`);
    console.log(`Word count: ${words.length.toLocaleString()}`);

    // ── Branching factors ─────────────────────────────────────────────────────
    const sample = words.length <= SAMPLE_BRANCHING
        ? words
        : Array.from({ length: SAMPLE_BRANCHING }, () => randomItem(words));

    const branchCounts = sample.map((w) => getNeighbors(w, wordSet).length);
    const bs = stats(branchCounts);

    // Histogram buckets
    const buckets: Record<string, number> = {};
    for (const n of branchCounts) {
        const key = n <= 2 ? '0–2' : n <= 4 ? '3–4' : n <= 6 ? '5–6' : n <= 9 ? '7–9' : n <= 12 ? '10–12' : '13+';
        buckets[key] = (buckets[key] ?? 0) + 1;
    }

    console.log(`\nBranching factors (sample of ${sample.length} words):`);
    console.log(`  min=${bs.min}  max=${bs.max}  avg=${bs.avg}  median=${bs.median}`);
    console.log(`  Distribution:`);
    for (const [range, count] of Object.entries(buckets)) {
        const pct = Math.round((count / sample.length) * 100);
        const bar = '█'.repeat(Math.round(pct / 2));
        console.log(`    ${range.padEnd(6)}  ${bar} ${pct}%`);
    }

    // ── BFS path lengths ──────────────────────────────────────────────────────
    const pathLengths: number[] = [];
    const noPath: number[] = [];
    let attempts = 0;

    while (pathLengths.length + noPath.length < SAMPLE_PAIRS && attempts < SAMPLE_PAIRS * 10) {
        attempts++;
        const a = randomItem(words);
        const b = randomItem(words);
        if (a === b) continue;
        const p = bfsShortestPath(a, b, wordSet);
        if (!p) { noPath.push(0); continue; }
        pathLengths.push(p.length - 1);
    }

    const pathDist: Record<number, number> = {};
    for (const l of pathLengths) pathDist[l] = (pathDist[l] ?? 0) + 1;

    console.log(`\nBFS path lengths (${pathLengths.length} reachable pairs out of ${pathLengths.length + noPath.length} sampled):`);
    for (const len of Object.keys(pathDist).map(Number).sort((a, b) => a - b)) {
        const pct = Math.round((pathDist[len] / pathLengths.length) * 100);
        const bar = '█'.repeat(Math.round(pct / 2));
        console.log(`  ${len} moves  ${bar} ${pct}% (${pathDist[len]})`);
    }

    // ── Puzzle potential at various thresholds ────────────────────────────────
    const thresholds = [
        { label: 'Current (moves 4–5, min≥7, avg≥7)', minMoves: 4, maxMoves: 5, minBranch: 7, avgBranch: 7 },
        { label: 'Relaxed  (moves 3–5, min≥5, avg≥6)', minMoves: 3, maxMoves: 5, minBranch: 5, avgBranch: 6 },
        { label: 'Loose    (moves 3–6, min≥3, avg≥4)', minMoves: 3, maxMoves: 6, minBranch: 3, avgBranch: 4 },
    ];

    console.log(`\nPuzzle quality estimates (from same ${pathLengths.length} pairs):`);
    for (const t of thresholds) {
        let passing = 0;
        for (const [a, pathLengthForPair] of pathLengths.entries()) {
            // Re-sample is expensive; approximate from the path length distribution only
            if (pathLengthForPair >= t.minMoves && pathLengthForPair <= t.maxMoves) passing++;
        }
        const pct = Math.round((passing / pathLengths.length) * 100);
        // Estimate total pairs: C(n,2) reachable pairs × passing%
        const reachableFraction = pathLengths.length / (pathLengths.length + noPath.length);
        const totalReachablePairs = Math.round((words.length * (words.length - 1)) / 2 * reachableFraction);
        const estimated = Math.round(totalReachablePairs * (pct / 100));
        console.log(`  ${t.label}`);
        console.log(`    ${pct}% of sampled pairs pass path length → ~${estimated.toLocaleString()} potential puzzles`);
    }
}

// ── Build word sets ───────────────────────────────────────────────────────────

const allPuzzleWords = loadPuzzleWords();
const words4 = allPuzzleWords.filter((w) => w.length === 4);
const words5 = allPuzzleWords.filter((w) => w.length === 5);

// 3-letter words: same pipeline as buildWordList but length=3
const raw = loadDictionary();
const common = loadCommonWords();
const words3 = filterCommonWords(filterBannedWords(raw), common).filter((w) => w.length === 3);

console.log('\nWord Length Statistics');
console.log('Evaluating puzzle potential for 3, 4, and 5 letter words...');

analyseLength('3-Letter Words', words3);
analyseLength('4-Letter Words (current)', words4);
analyseLength('5-Letter Words', words5);

console.log('\n');
