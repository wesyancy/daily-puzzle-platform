/**
 * Scores puzzle pairs against the difficulty model and prints a ranked table.
 *
 * Run this after rebuilding puzzle-words.txt to calibrate the difficulty formula.
 * If all existing pairs cluster in one tier, adjust the weights in difficultyScore.ts.
 *
 * Usage:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/scorePairs.ts [file] [--output FILE]
 *
 *   file           Pairs file to score (default: data/word-pairs.txt)
 *   --output FILE  Write a tiered pairs file sorted by difficulty score
 */

import fs from 'fs';
import path from 'path';
import { loadPuzzleWords, createWordSet } from '@repo/dictionary';
import { bfsShortestPath } from '@repo/game-engine';
import { computeDifficultyProfile, tierEmoji, type DifficultyProfile } from '../lib/difficultyScore';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const inputFile = argv.find((a) => !a.startsWith('--')) ?? 'data/word-pairs.txt';
const outputIndex = argv.indexOf('--output');
const outputFile = outputIndex !== -1 ? argv[outputIndex + 1] : null;

// ── Load word set ─────────────────────────────────────────────────────────────

const wordSet = createWordSet(loadPuzzleWords());

// ── Read pairs ────────────────────────────────────────────────────────────────

const inputPath = path.join(process.cwd(), inputFile);
const raw = fs.readFileSync(inputPath, 'utf-8');

type ScoredPair = {
    start: string;
    target: string;
    path: string[];
    profile: DifficultyProfile;
};

const results: ScoredPair[] = [];
const errors: { line: string; reason: string }[] = [];

for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [startRaw, targetRaw] = trimmed.split(',');
    const start = startRaw?.trim().toUpperCase();
    const target = targetRaw?.trim().split(/\s/)[0].toUpperCase(); // strip inline comments

    if (!start || !target) {
        errors.push({ line: trimmed, reason: 'malformed' });
        continue;
    }

    if (!wordSet.has(start)) {
        errors.push({ line: trimmed, reason: `"${start}" not in word set` });
        continue;
    }
    if (!wordSet.has(target)) {
        errors.push({ line: trimmed, reason: `"${target}" not in word set` });
        continue;
    }

    const p = bfsShortestPath(start, target, wordSet);
    if (!p) {
        errors.push({ line: trimmed, reason: 'no path exists' });
        continue;
    }

    results.push({ start, target, path: p, profile: computeDifficultyProfile(p, wordSet) });
}

// Sort by score ascending
results.sort((a, b) => a.profile.difficultyScore - b.profile.difficultyScore);

// ── Print table ───────────────────────────────────────────────────────────────

const COL = { pair: 16, moves: 7, avg: 7, min: 7, conc: 7, locked: 8, score: 7 };

function pad(s: string | number, len: number) {
    return String(s).padEnd(len);
}

console.log(`\n── Score Report: ${inputFile} ${'─'.repeat(Math.max(0, 50 - inputFile.length))}`);
console.log(
    `  ${pad('PAIR', COL.pair)}${pad('MOVES', COL.moves)}${pad('AVG', COL.avg)}${pad('MIN', COL.min)}${pad('CONC', COL.conc)}${pad('LOCKED', COL.locked)}${pad('SCORE', COL.score)}TIER`,
);
console.log(`  ${'─'.repeat(66)}`);

for (const r of results) {
    const { profile: p } = r;
    console.log(
        `  ${pad(`${r.start} → ${r.target}`, COL.pair)}${pad(p.pathDetails.length - 1, COL.moves)}${pad(p.avgBranchingFactor, COL.avg)}${pad(p.minBranchingFactor, COL.min)}${pad(p.avgPositionConcentration, COL.conc)}${pad(p.lockedPositionTotal, COL.locked)}${pad(p.difficultyScore, COL.score)}${tierEmoji(p.difficultyTier)} ${p.difficultyTier}`,
    );
}

if (errors.length > 0) {
    console.log(`\n── Skipped (${errors.length}) ${'─'.repeat(40)}`);
    for (const e of errors) {
        console.log(`  ✗  ${e.line.padEnd(20)}  ${e.reason}`);
    }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const easy = results.filter((r) => r.profile.difficultyTier === 'easy');
const medium = results.filter((r) => r.profile.difficultyTier === 'medium');
const hard = results.filter((r) => r.profile.difficultyTier === 'hard');

console.log(`\n── Summary ${'─'.repeat(50)}`);
console.log(`  🟢 Easy   (1–4): ${easy.length} pairs`);
console.log(`  🟡 Medium (5–7): ${medium.length} pairs`);
console.log(`  🔴 Hard  (8–10): ${hard.length} pairs`);
console.log(`  Total scored: ${results.length} | Skipped: ${errors.length}\n`);

// ── Optional tiered output file ───────────────────────────────────────────────

if (outputFile) {
    const outputPath = path.join(process.cwd(), outputFile);

    const header = [
        `# Steple scored pair pool`,
        `# Source: ${inputFile}`,
        `# Format: START,TARGET  # score=N tier=X moves=N avg=N min=N`,
        ``,
    ].join('\n');

    function section(label: string, pairs: ScoredPair[]): string {
        if (pairs.length === 0) return '';
        const lines = pairs.map((r) => {
            const p = r.profile;
            return `${r.start},${r.target}  # score=${p.difficultyScore} tier=${p.difficultyTier} moves=${p.pathDetails.length - 1} avg=${p.avgBranchingFactor} min=${p.minBranchingFactor}`;
        });
        return `# ── ${label} ${'─'.repeat(Math.max(0, 50 - label.length))}\n${lines.join('\n')}\n`;
    }

    const content =
        header +
        section('Easy (1–4)', easy) +
        '\n' +
        section('Medium (5–7)', medium) +
        '\n' +
        section('Hard (8–10)', hard);

    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`Wrote tiered output to ${outputFile}`);
}
