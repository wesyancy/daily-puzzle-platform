/**
 * Builds a large scored pair pool from the expanded puzzle word list.
 *
 * Enumerates pairs mathematically — no Datamuse, no semantic filter.
 * With ~3,800 four-letter candidates, the undirected pair space is ~7.3M pairs.
 * Exhaustive enumeration would take hours; use --sample N for random sampling.
 *
 * Pairs are scored with computeDifficultyProfile and written to a tiered output
 * file suitable for use as a daily puzzle source.
 *
 * Usage:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/buildPairPool.ts [options]
 *
 * Options:
 *   --length N         Word length: 4 or 5 (default: 4)
 *   --min-moves N      Minimum path length in moves (default: 3)
 *   --max-moves N      Maximum path length in moves (default: 7)
 *   --min-branching N  Min branching at any path step (default: 5)
 *   --min-avg N        Min average branching (default: 8)
 *   --allow-rare       Allow J, Z, V in start/target words
 *   --output FILE      Output file (default: data/pair-pool.txt)
 *   --sample N         Number of random pairs to attempt (default: 500000)
 *   --min-score N      Only include pairs with difficultyScore >= N
 *   --max-score N      Only include pairs with difficultyScore <= N
 *   --tier X           Only include pairs in tier: easy | medium | hard
 *
 * Tier targeting (recommended — run once per tier):
 *   --min-moves 4 --max-moves 4 --tier easy    → easy pool
 *   --min-moves 5 --max-moves 5 --tier medium  → medium pool
 *   --min-moves 6 --max-moves 7 --tier hard    → hard pool
 */

import fs from 'fs';
import path from 'path';
import { loadPuzzleWords, createWordSet, getNeighbors, loadCommonWords } from '@repo/dictionary';
import { bfsShortestPath } from '@repo/game-engine';
import { computeDifficultyProfile, type DifficultyProfile } from '../lib/difficultyScore';

// ── Arg parsing ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getNumArg(flag: string, defaultVal: number): number {
    const i = argv.indexOf(flag);
    if (i === -1) return defaultVal;
    const val = parseInt(argv[i + 1] ?? '', 10);
    return isNaN(val) ? defaultVal : val;
}

function getStrArg(flag: string, defaultVal: string): string {
    const i = argv.indexOf(flag);
    if (i === -1) return defaultVal;
    return argv[i + 1] ?? defaultVal;
}

function hasFlag(flag: string): boolean {
    return argv.includes(flag);
}

const opts = {
    length:       getNumArg('--length',        4),
    minMoves:     getNumArg('--min-moves',     4),
    maxMoves:     getNumArg('--max-moves',     5),
    minBranching: getNumArg('--min-branching', 7),
    minAvg:       getNumArg('--min-avg',       9),
    allowRare:    hasFlag('--allow-rare'),
    output:       getStrArg('--output',        'data/pair-pool.txt'),
    sample:       getNumArg('--sample',        500_000),
    minScore:     getNumArg('--min-score',     1),
    maxScore:     getNumArg('--max-score',     10),
    tier:         getStrArg('--tier',          ''),
};

// ── Setup ──────────────────────────────────────────────────────────────────────

const RARE_LETTERS = new Set(['J', 'Z', 'V']);

function isRareFree(word: string): boolean {
    return ![...word].some((c) => RARE_LETTERS.has(c));
}

const allWords = loadPuzzleWords();
const wordSet = createWordSet(allWords);
// Puzzle endpoints must be familiar — commonWords gates start/target selection only.
// The full wordSet is still used for BFS and neighbor computation.
const commonWords = loadCommonWords();

const candidates = allWords.filter((w) => {
    if (w.length !== opts.length) return false;
    if (!commonWords.has(w)) return false;
    if (!opts.allowRare && !isRareFree(w)) return false;
    return true;
});

console.log(`\nBuilding pair pool`);
console.log(`  Word length: ${opts.length}   Candidate pool: ${candidates.length} words`);
console.log(`  Moves: ${opts.minMoves}–${opts.maxMoves}   Branching: min≥${opts.minBranching} avg≥${opts.minAvg}`);
if (opts.tier) console.log(`  Tier filter: ${opts.tier}`);
if (opts.minScore > 1 || opts.maxScore < 10) console.log(`  Score filter: ${opts.minScore}–${opts.maxScore}`);
console.log(`  Sampling ${opts.sample.toLocaleString()} random pairs\n`);

// ── Result type ────────────────────────────────────────────────────────────────

type PoolEntry = {
    start: string;
    target: string;
    moves: number;
    profile: DifficultyProfile;
};

// ── Search ─────────────────────────────────────────────────────────────────────

const results: PoolEntry[] = [];
const seen = new Set<string>();
let attempts = 0;
let lastProgress = 0;

while (attempts < opts.sample) {
    attempts++;

    if (attempts - lastProgress >= 25_000) {
        lastProgress = attempts;
        process.stdout.write(
            `  ${attempts.toLocaleString()}/${opts.sample.toLocaleString()} attempts   ${results.length} found\r`,
        );
    }

    const si = Math.floor(Math.random() * candidates.length);
    const ti = Math.floor(Math.random() * candidates.length);
    if (si === ti) continue;

    const start = candidates[si];
    const target = candidates[ti];

    const key = [start, target].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    // Fast pre-filter: BFS to check path length
    const p = bfsShortestPath(start, target, wordSet);
    if (!p) continue;

    const moves = p.length - 1;
    if (moves < opts.minMoves || moves > opts.maxMoves) continue;

    // Clean path check — every word on the path must be a common/familiar word
    if (!p.every((w) => commonWords.has(w))) continue;

    // Quick branching pre-filter before the expensive per-position analysis
    const branchCounts = p.map((w) => getNeighbors(w, wordSet).length);
    const minBranch = Math.min(...branchCounts);
    const avgBranch = branchCounts.reduce((s, n) => s + n, 0) / branchCounts.length;
    if (minBranch < opts.minBranching) continue;
    if (avgBranch < opts.minAvg) continue;

    // Full difficulty profile
    const profile = computeDifficultyProfile(p, wordSet);
    if (profile.difficultyScore < opts.minScore || profile.difficultyScore > opts.maxScore) continue;
    if (opts.tier && profile.difficultyTier !== opts.tier) continue;

    results.push({ start, target, moves, profile });
}

process.stdout.write('\n');

// ── Sort and deduplicate ───────────────────────────────────────────────────────

results.sort((a, b) =>
    a.profile.difficultyScore - b.profile.difficultyScore ||
    a.start.localeCompare(b.start),
);

// ── Summary ────────────────────────────────────────────────────────────────────

const easy   = results.filter((r) => r.profile.difficultyTier === 'easy');
const medium = results.filter((r) => r.profile.difficultyTier === 'medium');
const hard   = results.filter((r) => r.profile.difficultyTier === 'hard');

console.log(`\n── Results ─────────────────────────────────────────────────`);
console.log(`  🟢 Easy   (1–6): ${easy.length}`);
console.log(`  🟡 Medium (7–8): ${medium.length}`);
console.log(`  🔴 Hard   (9+):  ${hard.length}`);
console.log(`  Total: ${results.length} pairs from ${attempts.toLocaleString()} attempts (${seen.size.toLocaleString()} unique tested)`);

// ── Write output ───────────────────────────────────────────────────────────────

function formatEntry(r: PoolEntry): string {
    const p = r.profile;
    return `${r.start},${r.target}  # score=${p.difficultyScore} tier=${p.difficultyTier} moves=${r.moves} avg=${p.avgBranchingFactor} min=${p.minBranchingFactor} conc=${p.avgPositionConcentration}`;
}

function section(label: string, pairs: PoolEntry[]): string {
    if (pairs.length === 0) return '';
    return `# ── ${label} ${'─'.repeat(Math.max(0, 52 - label.length))}\n${pairs.map(formatEntry).join('\n')}\n`;
}

const outputPath = path.join(process.cwd(), opts.output);
const header = [
    `# Stepladder pair pool`,
    `# Generated: ${new Date().toISOString().split('T')[0]}`,
    `# Word length: ${opts.length}   Moves: ${opts.minMoves}–${opts.maxMoves}   Sample: ${attempts.toLocaleString()}`,
    `# Pairs: ${results.length} (easy: ${easy.length}, medium: ${medium.length}, hard: ${hard.length})`,
    `# Format: START,TARGET  # score=N tier=X moves=N avg=N min=N conc=N`,
    ``,
].join('\n');

const content =
    header +
    section('Easy (score 1–6, moves 4)', easy) + '\n' +
    section('Medium (score 7–8, moves 5)', medium) + '\n' +
    section('Hard (score 9–10, moves 6+)', hard);

fs.writeFileSync(outputPath, content, 'utf-8');
console.log(`\nWrote ${results.length} pairs to ${opts.output}\n`);
