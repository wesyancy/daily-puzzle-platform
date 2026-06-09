/**
 * Configurable puzzle generator for Stepladder.
 *
 * Finds START→TARGET pairs that meet adjustable quality thresholds.
 * Default settings match the validated profile used in word-pairs.txt.
 *
 * Usage:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/generatePuzzle.ts [options]
 *
 * Options:
 *   --count N           Number of puzzles to find (default: 5)
 *   --min-moves N       Minimum path length in moves (default: 4)
 *   --max-moves N       Maximum path length in moves (default: 5)
 *   --min-branching N   Minimum branching at any step on the path (default: 7)
 *   --min-avg N         Minimum average branching across the path (default: 7)
 *   --length N          Word length: 4 or 5 (default: 4)
 *   --similarity N      Require ≥ N letters in the same position (default: 0)
 *   --allow-rare        Allow J, Z, V in start/target words
 *   --semantic          Use Datamuse to find semantically related pairs (slower)
 *   --save              Append results to data/suggested-pairs.txt
 *   --difficulty X      Preset: easy | medium | hard (overrides move/branching flags)
 *
 * Difficulty presets (calibrated for the expanded 12k-word set):
 *   easy:   4-move paths, high branching floor (score ≈ 5–6)
 *   medium: 5-move paths, standard branching (score ≈ 7–8)
 *   hard:   6–7-move paths, relaxed branching floor (score ≈ 9–10)
 *
 * Examples:
 *   # 10 random 4-letter puzzles with the default quality bar
 *   ... generatePuzzle.ts --count 10
 *
 *   # Easier puzzles (more moves, lower branching threshold)
 *   ... generatePuzzle.ts --min-moves 3 --max-moves 6 --min-branching 5 --min-avg 5
 *
 *   # Only pairs with no shared letters in the same position (maximum tension)
 *   ... generatePuzzle.ts --similarity 0 --count 10
 *
 *   # Semantically related pairs, saved for review
 *   ... generatePuzzle.ts --semantic --count 20 --save
 *
 *   # 5-letter puzzles, lower branching threshold (5-letter graphs are sparser)
 *   ... generatePuzzle.ts --length 5 --min-branching 3 --min-avg 4
 */

import fs from 'fs';
import path from 'path';
import { loadPuzzleWords, createWordSet, getNeighbors, loadCommonWords } from '@repo/dictionary';
import { bfsShortestPath } from '@repo/game-engine';
import { computeDifficultyProfile, tierEmoji } from '../lib/difficultyScore';

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

// Difficulty presets — calibrated for the expanded ~12k-word set.
// Path length is the primary tier selector; branching floors avoid forced/trivial steps.
const DIFFICULTY_PRESETS: Record<string, { minMoves: number; maxMoves: number; minBranching: number; minAvg: number }> = {
    easy:   { minMoves: 4, maxMoves: 4, minBranching: 10, minAvg: 12 },
    medium: { minMoves: 5, maxMoves: 5, minBranching: 7,  minAvg: 10 },
    hard:   { minMoves: 6, maxMoves: 7, minBranching: 3,  minAvg: 6  },
};

const difficultyPreset = getStrArg('--difficulty', '');
const preset = DIFFICULTY_PRESETS[difficultyPreset];

const opts = {
    count:        getNumArg('--count',         5),
    minMoves:     preset?.minMoves     ?? getNumArg('--min-moves',     4),
    maxMoves:     preset?.maxMoves     ?? getNumArg('--max-moves',     5),
    minBranching: preset?.minBranching ?? getNumArg('--min-branching', 7),
    minAvg:       preset?.minAvg       ?? getNumArg('--min-avg',       7),
    length:       getNumArg('--length',        4),
    similarity:   getNumArg('--similarity',    0),
    allowRare:    hasFlag('--allow-rare'),
    semantic:     hasFlag('--semantic'),
    save:         hasFlag('--save'),
    difficulty:   difficultyPreset,
};

// ── Types ──────────────────────────────────────────────────────────────────────

type QualityPass = {
    pass: true;
    path: string[];
    moves: number;
    avgBranching: number;
    minBranching: number;
};

type PuzzleResult = QualityPass & {
    start: string;
    target: string;
    similarity: number;
};

// ── Quality check ──────────────────────────────────────────────────────────────

const RARE_LETTERS = new Set(['J', 'Z', 'V']);

function checkQuality(
    start: string,
    target: string,
    wordSet: Set<string>,
): QualityPass | { pass: false } {
    const p = bfsShortestPath(start, target, wordSet);
    if (!p) return { pass: false };

    const moves = p.length - 1;
    if (moves < opts.minMoves || moves > opts.maxMoves) return { pass: false };

    const branches = p.map((w) => getNeighbors(w, wordSet).length);
    const avg =
        Math.round((branches.reduce((s, n) => s + n, 0) / branches.length) * 10) / 10;
    const min = Math.min(...branches);

    if (min < opts.minBranching) return { pass: false };
    if (avg < opts.minAvg) return { pass: false };

    return { pass: true, path: p, moves, avgBranching: avg, minBranching: min };
}

function letterSimilarity(a: string, b: string): number {
    let matches = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) matches++;
    return matches;
}

function isRareFree(word: string): boolean {
    return ![...word].some((c) => RARE_LETTERS.has(c));
}

// ── Datamuse ───────────────────────────────────────────────────────────────────

const DELAY_MS = 60;

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

function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
}

// ── Search modes ───────────────────────────────────────────────────────────────

function randomSearch(
    candidates: string[],
    wordSet: Set<string>,
): PuzzleResult[] {
    const found: PuzzleResult[] = [];
    const seen = new Set<string>();
    const MAX_ATTEMPTS = 200_000;
    let attempts = 0;

    while (found.length < opts.count && attempts < MAX_ATTEMPTS) {
        attempts++;

        const start = candidates[Math.floor(Math.random() * candidates.length)];
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        if (start === target) continue;

        const key = [start, target].sort().join(',');
        if (seen.has(key)) continue;
        seen.add(key);

        const sim = letterSimilarity(start, target);
        if (sim < opts.similarity) continue;

        const q = checkQuality(start, target, wordSet);
        if (!q.pass) continue;

        // Clean path check — every word on the path must be a common/familiar word
        if (!q.path.every((w) => commonWords.has(w))) continue;

        found.push({ ...q, start, target, similarity: sim });
        process.stdout.write(
            `  [${found.length}/${opts.count}] ${start} → ${target}  moves=${q.moves} avg=${q.avgBranching} min=${q.minBranching} sim=${sim}\n`,
        );
    }

    if (attempts >= MAX_ATTEMPTS) {
        console.log(
            `\n  Warning: hit ${MAX_ATTEMPTS} attempts — try relaxing --min-branching or --min-avg.`,
        );
    }

    return found;
}

async function semanticSearch(
    candidates: string[],
    wordSet: Set<string>,
): Promise<PuzzleResult[]> {
    const found: PuzzleResult[] = [];
    const seen = new Set<string>();
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);

    console.log(
        `  Querying Datamuse for up to ${shuffled.length} words (${DELAY_MS}ms/call)…\n`,
    );

    for (let i = 0; i < shuffled.length && found.length < opts.count; i++) {
        const word = shuffled[i];

        if (i > 0 && i % 100 === 0) {
            process.stdout.write(`  ${i}/${shuffled.length} scanned, ${found.length}/${opts.count} found…\n`);
        }

        const antonyms = await fetchRelated(word, 'rel_ant');
        await sleep(DELAY_MS);
        const triggers = await fetchRelated(word, 'rel_trg');
        await sleep(DELAY_MS);

        const candidates2 = [...new Set([...antonyms, ...triggers])];

        for (const related of candidates2) {
            if (related.length !== opts.length) continue;
            if (!wordSet.has(related)) continue;
            if (related === word) continue;
            if (!opts.allowRare && (!isRareFree(related) || !isRareFree(word))) continue;

            const key = [word, related].sort().join(',');
            if (seen.has(key)) continue;
            seen.add(key);

            const sim = letterSimilarity(word, related);
            if (sim < opts.similarity) continue;

            const q = checkQuality(word, related, wordSet);
            if (!q.pass) continue;

            // Clean path check — every word on the path must be a common/familiar word
            if (!q.path.every((w) => commonWords.has(w))) continue;

            found.push({ ...q, start: word, target: related, similarity: sim });
            process.stdout.write(
                `  [${found.length}/${opts.count}] ${word} → ${related}  moves=${q.moves} avg=${q.avgBranching} min=${q.minBranching} sim=${sim}\n`,
            );
        }
    }

    return found;
}

// ── Output ─────────────────────────────────────────────────────────────────────

function printResult(r: PuzzleResult, wordSet: Set<string>, i: number): void {
    const profile = computeDifficultyProfile(r.path, wordSet);
    console.log(
        `\n── Puzzle ${i + 1} ─────────────────────────────────────────────`,
    );
    console.log(`  ${r.start} → ${r.target}`);
    console.log(`  Path (${r.moves} moves):  ${r.path.join(' → ')}`);
    console.log(
        `  Avg branching: ${r.avgBranching}   Min branching: ${r.minBranching}   Shared position letters: ${r.similarity}`,
    );
    console.log(
        `  Difficulty: ${profile.difficultyScore}/10  ${tierEmoji(profile.difficultyTier)} ${profile.difficultyTier}   Concentration: ${profile.avgPositionConcentration}   Locked positions: ${profile.lockedPositionTotal}`,
    );
}

function saveResults(results: PuzzleResult[]): void {
    const outputPath = path.join(process.cwd(), 'data/suggested-pairs.txt');
    const lines = results
        .map(
            (r) =>
                `${r.start},${r.target}  # moves=${r.moves} avg=${r.avgBranching} min=${r.minBranching} sim=${r.similarity}${opts.semantic ? ' semantic' : ''}`,
        )
        .join('\n');
    fs.appendFileSync(outputPath, lines + '\n', 'utf-8');
    console.log(`\nAppended ${results.length} pair(s) to data/suggested-pairs.txt`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

// Module-level word sets — shared by main() and search functions
const _allWords = loadPuzzleWords();
const wordSet = createWordSet(_allWords);
// commonWords gates both start/target candidates AND path intermediates.
const commonWords = loadCommonWords();

async function main() {
    const allWords = _allWords;
    const candidates = allWords.filter((w) => {
        if (w.length !== opts.length) return false;
        if (!commonWords.has(w)) return false;
        if (!opts.allowRare && !isRareFree(w)) return false;
        return true;
    });

    const modeLabel = opts.semantic ? 'semantic (Datamuse)' : 'random';
    const presetLabel = opts.difficulty ? `  preset=${opts.difficulty}` : '';
    console.log(`\nMode: ${modeLabel}${presetLabel}`);
    console.log(
        `Settings: length=${opts.length}  moves=${opts.minMoves}–${opts.maxMoves}  branching: min≥${opts.minBranching} avg≥${opts.minAvg}  similarity≥${opts.similarity}${opts.allowRare ? '  rare-letters=on' : ''}`,
    );
    console.log(`Candidate pool: ${candidates.length} words\n`);

    let results: PuzzleResult[];

    if (opts.semantic) {
        results = await semanticSearch(candidates, wordSet);
    } else {
        results = randomSearch(candidates, wordSet);
    }

    for (let i = 0; i < results.length; i++) {
        printResult(results[i], wordSet, i);
    }

    console.log(
        `\n── Summary: found ${results.length}/${opts.count} puzzle(s) ─────────────────────`,
    );

    if (opts.save && results.length > 0) {
        saveResults(results);
    } else if (results.length > 0) {
        console.log(
            `  Tip: add --save to append these to data/suggested-pairs.txt\n`,
        );
    }
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
