/**
 * Validates word pairs against the game graph and quality thresholds.
 *
 * Quality target: the COLD → WARM profile
 *   - Path length: 4–5 moves (feels approachable, not trivial)
 *   - Min branching factor: ≥ 5 (no step should feel forced)
 *   - Avg branching factor: ≥ 7 (player always has room to explore)
 *
 * Also enforces:
 *   - No rare letters (J, Z, V) in start or target
 *   - No blocked words (proper nouns, inappropriate)  — blocked-words.txt
 *   - No blocked pairs (specific bad combinations)    — blocked-pairs.txt
 *
 * Usage:
 *   # Validate word-pairs.txt and overwrite with only passing pairs:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/validateWordPairs.ts
 *
 *   # Validate a different file (e.g. Datamuse suggestions):
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/validateWordPairs.ts data/suggested-pairs.txt
 */

import fs from 'fs';
import path from 'path';

import { loadPuzzleWords, createWordSet, getNeighbors } from '@repo/dictionary';
import { bfsShortestPath } from '@repo/game-engine';

// ── Quality thresholds (COLD→WARM profile) ──────────────────────────────────
const MIN_MOVES = 4;
const MAX_MOVES = 5;
const MIN_BRANCHING_FACTOR = 7;
const MIN_AVG_BRANCHING = 7;

// Letters banned from puzzle start/target words
const RARE_LETTERS = new Set(['J', 'Z', 'V']);
// ────────────────────────────────────────────────────────────────────────────

function loadLines(file: string): string[] {
    const filePath = path.join(process.cwd(), file);
    return fs
        .readFileSync(filePath, 'utf-8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
}

// Words that must never appear as a puzzle start or target
const BLOCKED_WORDS = new Set(loadLines('data/blocked-words.txt'));

// Specific pairs that must never appear as a puzzle (stored as "A,B")
const BLOCKED_PAIRS = new Set(loadLines('data/blocked-pairs.txt'));

// ─────────────────────────────────────────────────────────────────────────────

const inputFile = process.argv[2] ?? 'data/word-pairs.txt';
const inputPath = path.join(process.cwd(), inputFile);
const raw = fs.readFileSync(inputPath, 'utf-8');

const wordSet = createWordSet(loadPuzzleWords());

type Result = {
    pair: [string, string];
    status: 'pass' | 'fail';
    reason?: string;
    moves?: number;
    avgBranching?: number;
    minBranching?: number;
};

const results: Result[] = [];

for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(',');
    const start = parts[0]?.trim().toUpperCase();
    const target = parts[1]?.trim().toUpperCase();

    if (!start || !target) {
        results.push({ pair: [start ?? '', target ?? ''], status: 'fail', reason: 'malformed line' });
        continue;
    }

    // ── Blocklist checks (fast, before BFS) ────────────────────────────────

    if (BLOCKED_WORDS.has(start)) {
        results.push({ pair: [start, target], status: 'fail', reason: `"${start}" is a blocked word` });
        continue;
    }
    if (BLOCKED_WORDS.has(target)) {
        results.push({ pair: [start, target], status: 'fail', reason: `"${target}" is a blocked word` });
        continue;
    }

    if (BLOCKED_PAIRS.has(`${start},${target}`) || BLOCKED_PAIRS.has(`${target},${start}`)) {
        results.push({ pair: [start, target], status: 'fail', reason: 'blocked pair' });
        continue;
    }

    // ── Rare letter check ──────────────────────────────────────────────────

    const rareInStart = [...start].find((c) => RARE_LETTERS.has(c));
    const rareInTarget = [...target].find((c) => RARE_LETTERS.has(c));
    if (rareInStart ?? rareInTarget) {
        const which = rareInStart
            ? `"${start}" contains ${rareInStart}`
            : `"${target}" contains ${rareInTarget}`;
        results.push({ pair: [start, target], status: 'fail', reason: which });
        continue;
    }

    // ── Word set membership ────────────────────────────────────────────────

    if (!wordSet.has(start)) {
        results.push({ pair: [start, target], status: 'fail', reason: `"${start}" not in word set` });
        continue;
    }
    if (!wordSet.has(target)) {
        results.push({ pair: [start, target], status: 'fail', reason: `"${target}" not in word set` });
        continue;
    }

    // ── Graph / quality checks ─────────────────────────────────────────────

    const p = bfsShortestPath(start, target, wordSet);
    if (!p) {
        results.push({ pair: [start, target], status: 'fail', reason: 'no path exists' });
        continue;
    }

    const moves = p.length - 1;
    if (moves < MIN_MOVES || moves > MAX_MOVES) {
        results.push({ pair: [start, target], status: 'fail', reason: `path length ${moves} (need ${MIN_MOVES}–${MAX_MOVES})` });
        continue;
    }

    const branchCounts = p.map((w) => getNeighbors(w, wordSet).length);
    const avgBranching =
        Math.round((branchCounts.reduce((s, n) => s + n, 0) / branchCounts.length) * 10) / 10;
    const minBranching = Math.min(...branchCounts);

    if (minBranching < MIN_BRANCHING_FACTOR) {
        results.push({ pair: [start, target], status: 'fail', reason: `min branching ${minBranching} (need ≥ ${MIN_BRANCHING_FACTOR})`, moves, avgBranching, minBranching });
        continue;
    }
    if (avgBranching < MIN_AVG_BRANCHING) {
        results.push({ pair: [start, target], status: 'fail', reason: `avg branching ${avgBranching} (need ≥ ${MIN_AVG_BRANCHING})`, moves, avgBranching, minBranching });
        continue;
    }

    results.push({ pair: [start, target], status: 'pass', moves, avgBranching, minBranching });
}

// ── Report ───────────────────────────────────────────────────────────────────

const passing = results.filter((r) => r.status === 'pass');
const failing = results.filter((r) => r.status === 'fail');

console.log(`\n── Passing (${passing.length}) ──────────────────────────────────`);
for (const r of passing) {
    console.log(`  ✓  ${r.pair[0].padEnd(4)} → ${r.pair[1].padEnd(4)}   moves=${r.moves}  avg=${r.avgBranching}  min=${r.minBranching}`);
}

console.log(`\n── Failing (${failing.length}) ──────────────────────────────────`);
for (const r of failing) {
    console.log(`  ✗  ${r.pair[0].padEnd(4)} → ${r.pair[1].padEnd(4)}   ${r.reason}`);
}

console.log(`\nTotal: ${passing.length} pass, ${failing.length} fail\n`);

// ── Overwrite input file with only passing pairs ──────────────────────────────

const header = raw
    .split('\n')
    .filter((l) => l.trim().startsWith('#'))
    .join('\n');

const passingLines = passing.map((r) => `${r.pair[0]},${r.pair[1]}`).join('\n');
fs.writeFileSync(inputPath, header + '\n\n' + passingLines + '\n', 'utf-8');
console.log(`Wrote ${passing.length} validated pairs back to ${inputFile}`);
