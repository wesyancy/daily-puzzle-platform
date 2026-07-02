/**
 * Puzzle set generation for Stepladder.
 *
 * Returns a PuzzleSet of three tiered puzzles (easy → medium → hard).
 *
 * Mode is controlled by DAILY_MODE, read from the DAILY_MODE env var:
 *   unset/false — unlimited mode: random set from the scored pair pool
 *   'true'      — daily mode: deterministic set from daily-schedule.json
 *
 * Set per-environment in Vercel project settings (Production=true, Preview/Dev unset)
 * so production locks to one-a-day while preview deployments stay unlimited for testing.
 */

import fs from 'fs';
import path from 'path';
import { loadPuzzleWords, createWordSet, loadCommonWords } from '@repo/dictionary';
import { bfsShortestPath, computeNeighborGraph } from '@repo/game-engine';

// ── Config ─────────────────────────────────────────────────────────────────────

// Explicit opt-in: a missing/misconfigured env var fails safe to unlimited mode
// rather than accidentally locking production into daily mode.
const DAILY_MODE = process.env.DAILY_MODE === 'true';

// Exported so the page can pass isDailyMode to GameClient, which uses it to
// hide the "New puzzle set" button (no re-rolls in daily mode).
export const isDailyMode = DAILY_MODE;

// Single fixed reference timezone for the daily rollover (same convention as NYT
// Wordle) — every player gets the new puzzle at midnight here, not their own local
// midnight, since true per-player local rollover would require moving puzzle
// generation to the client.
const DAILY_ROLLOVER_TZ = 'America/New_York';

// ── Types ──────────────────────────────────────────────────────────────────────

export type Tier = 'easy' | 'medium' | 'hard';

export type TieredPuzzle = {
    tier: Tier;
    start: string;
    target: string;
    optimalPath: string[];
    neighborGraph: Record<string, string[]>;
    moveLimit: number;
};

export type PuzzleSet = {
    /** Stable identity for this set — used as localStorage key. */
    id: string;
    easy: TieredPuzzle;
    medium: TieredPuzzle;
    hard: TieredPuzzle;
};

// Move limit = optimal path length + buffer. More buffer → more forgiving.
const MOVE_LIMIT_BUFFER: Record<Tier, number> = {
    easy:   3,  // 4-move optimal → 7 guesses
    medium: 3,  // 5-move optimal → 8 guesses
    hard:   2,  // 6-move optimal → 8 guesses
};

// ── Public entry point ─────────────────────────────────────────────────────────

export function getPuzzleSet(): PuzzleSet {
    return DAILY_MODE ? getDailyPuzzleSet() : getRandomPuzzleSet();
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function buildTieredPuzzle(tier: Tier, start: string, target: string, wordSet: Set<string>): TieredPuzzle {
    const optimalPath = bfsShortestPath(start, target, wordSet);
    if (!optimalPath) throw new Error(`No path from ${start} to ${target}`);
    return {
        tier,
        start,
        target,
        optimalPath,
        neighborGraph: computeNeighborGraph(start, wordSet),
        moveLimit: optimalPath.length - 1 + MOVE_LIMIT_BUFFER[tier],
    };
}

function setPairId(easy: [string, string], med: [string, string], hard: [string, string]): string {
    return `${easy[0]}-${easy[1]}|${med[0]}-${med[1]}|${hard[0]}-${hard[1]}`;
}

function randomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
    return [...arr].sort(() => Math.random() - 0.5);
}

// ── Random mode ────────────────────────────────────────────────────────────────

const TIER_MOVE_RANGE: Record<Tier, [number, number]> = {
    easy:   [4, 4],
    medium: [5, 5],
    hard:   [6, 7],
};

// Module-level cache — the pair pool is read once per server process.
let _pairPoolCache: Record<Tier, [string, string][]> | null = null;

/** Load the scored pair pool, return pairs grouped by tier. Cached after first read. */
function loadPairPool(): Record<Tier, [string, string][]> {
    if (_pairPoolCache) return _pairPoolCache;

    const poolPath = path.join(process.cwd(), '../../games/ladder/data/pair-pool.txt');
    const pool: Record<Tier, [string, string][]> = { easy: [], medium: [], hard: [] };

    if (!fs.existsSync(poolPath)) {
        _pairPoolCache = pool;
        return pool;
    }

    for (const line of fs.readFileSync(poolPath, 'utf-8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const [pairPart] = trimmed.split('#');
        const [startRaw, targetRaw] = (pairPart ?? '').split(',');
        const start = startRaw?.trim().toUpperCase();
        const target = targetRaw?.trim().toUpperCase();
        if (!start || !target) continue;

        // Parse tier from the comment
        const tierMatch = trimmed.match(/tier=(easy|medium|hard)/);
        const tier = tierMatch?.[1] as Tier | undefined;
        if (tier && pool[tier]) pool[tier].push([start, target]);
    }

    _pairPoolCache = pool;
    return pool;
}

/**
 * Fallback: find a pair at the right move count by random BFS search.
 * Used when the pair pool is empty for a given tier.
 */
function findRandomPairForTier(
    tier: Tier,
    wordSet: Set<string>,
    candidates: string[],
    blockedWords: Set<string>,
): [string, string] {
    const [minMoves, maxMoves] = TIER_MOVE_RANGE[tier];
    const shuffled = shuffle(candidates);
    const MAX = 10_000;

    for (let i = 0; i < MAX; i++) {
        const start = shuffled[i % shuffled.length];
        const target = shuffled[(i + Math.floor(shuffled.length / 3)) % shuffled.length];
        if (start === target) continue;
        if (blockedWords.has(start) || blockedWords.has(target)) continue;

        const p = bfsShortestPath(start, target, wordSet);
        if (!p) continue;

        const moves = p.length - 1;
        if (moves >= minMoves && moves <= maxMoves) return [start, target];
    }

    // Last resort: return first pair from word-pairs.txt that fits
    return findFallbackPairFromCurated(tier);
}

function findFallbackPairFromCurated(tier: Tier): [string, string] {
    const [minMoves, maxMoves] = TIER_MOVE_RANGE[tier];
    const pairsPath = path.join(process.cwd(), '../../games/ladder/data/word-pairs.txt');

    try {
        const wordSet = createWordSet(loadPuzzleWords());
        const lines = fs.readFileSync(pairsPath, 'utf-8').split('\n');
        for (const line of shuffle(lines)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const [a, b] = trimmed.split(',');
            const start = a?.trim().toUpperCase();
            const target = b?.trim().split(/\s/)[0].toUpperCase();
            if (!start || !target) continue;
            const p = bfsShortestPath(start, target, wordSet);
            if (!p) continue;
            const moves = p.length - 1;
            if (moves >= minMoves && moves <= maxMoves) return [start, target];
        }
    } catch {}

    // Absolute last resort — COLD→WARM is always a valid easy pair
    return ['COLD', 'WARM'];
}

function getRandomPuzzleSet(): PuzzleSet {
    const allWords = loadPuzzleWords();
    const wordSet = createWordSet(allWords);
    // Puzzle endpoints must be familiar words — full wordSet is still used for graph traversal.
    const commonWords = loadCommonWords();
    const candidates = allWords.filter((w) => w.length === 4 && commonWords.has(w));

    const blockedWordsPath = path.join(process.cwd(), '../../games/ladder/data/blocked-words.txt');
    const blockedWords = new Set<string>();
    try {
        fs.readFileSync(blockedWordsPath, 'utf-8')
            .split('\n')
            .map((l) => l.trim().toUpperCase())
            .filter((l) => l.length > 0 && !l.startsWith('#'))
            .forEach((w) => blockedWords.add(w));
    } catch {}

    const pool = loadPairPool();
    const tiers: Tier[] = ['easy', 'medium', 'hard'];
    const chosen: Record<Tier, [string, string]> = {} as Record<Tier, [string, string]>;

    for (const tier of tiers) {
        if (pool[tier].length > 0) {
            chosen[tier] = randomItem(pool[tier]);
        } else {
            chosen[tier] = findRandomPairForTier(tier, wordSet, candidates, blockedWords);
        }
    }

    return {
        id: setPairId(chosen.easy, chosen.medium, chosen.hard),
        easy:   buildTieredPuzzle('easy',   chosen.easy[0],   chosen.easy[1],   wordSet),
        medium: buildTieredPuzzle('medium', chosen.medium[0], chosen.medium[1], wordSet),
        hard:   buildTieredPuzzle('hard',   chosen.hard[0],   chosen.hard[1],   wordSet),
    };
}

// ── Daily mode ─────────────────────────────────────────────────────────────────

type DailyScheduleEntry = {
    easy:   [string, string];
    medium: [string, string];
    hard:   [string, string];
};

// 'en-CA' locale formats Intl dates as 'YYYY-MM-DD', matching the schedule's key format.
function getTodayKey(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_ROLLOVER_TZ }).format(new Date());
}

function getDailyPuzzleSet(): PuzzleSet {
    const schedulePath = path.join(process.cwd(), '../../games/ladder/data/daily-schedule.json');
    const today = getTodayKey(); // 'YYYY-MM-DD' in DAILY_ROLLOVER_TZ

    let entry: DailyScheduleEntry | undefined;
    try {
        const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf-8')) as Record<string, DailyScheduleEntry>;
        entry = schedule[today];
    } catch {}

    if (!entry) {
        // No schedule entry for today — fall back to random
        console.warn(`[stepladder] No daily schedule entry for ${today}, falling back to random set`);
        return getRandomPuzzleSet();
    }

    const allWords = loadPuzzleWords();
    const wordSet = createWordSet(allWords);

    return {
        id: setPairId(entry.easy, entry.medium, entry.hard),
        easy:   buildTieredPuzzle('easy',   entry.easy[0],   entry.easy[1],   wordSet),
        medium: buildTieredPuzzle('medium', entry.medium[0], entry.medium[1], wordSet),
        hard:   buildTieredPuzzle('hard',   entry.hard[0],   entry.hard[1],   wordSet),
    };
}
