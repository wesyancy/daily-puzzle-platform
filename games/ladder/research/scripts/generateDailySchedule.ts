/**
 * Draft upcoming daily-schedule.json entries.
 *
 * Picks one fresh easy/medium/hard pair per day from the scored pair pool
 * (data/pair-pool.txt), falling back to a fresh BFS random search for tiers
 * with no pool coverage (e.g. 'hard', which currently has zero pairs in the
 * pool — see PUZZLE_PIPELINE.md). Never reuses a pair already present
 * anywhere in the existing schedule (any tier, any date), or within the
 * newly generated batch. Never overwrites a date that already has an entry.
 * Excludes anything in data/blocked-words.txt or data/blocked-pairs.txt —
 * note this filters at *selection* time only; pair-pool.txt itself was built
 * without consulting these blocklists, so it may still contain blocked
 * entries that simply never get chosen.
 * Writes a merged, date-sorted daily-schedule.json — review the diff before
 * deploying, this is a draft, not an auto-publish.
 *
 * Usage:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/generateDailySchedule.ts [options]
 *
 * Options:
 *   --days N      Number of new days to generate (default: 14)
 *   --start DATE  First date to generate, YYYY-MM-DD (default: tomorrow in --tz)
 *   --tz ZONE     IANA timezone for date math (default: America/New_York —
 *                 must match DAILY_ROLLOVER_TZ in apps/web/src/lib/generatePuzzle.ts)
 */

import fs from 'fs';
import path from 'path';
import { loadPuzzleWords, createWordSet, loadCommonWords } from '@repo/dictionary';
import { bfsShortestPath } from '@repo/game-engine';
import { computeDifficultyProfile } from '../lib/difficultyScore';

type Tier = 'easy' | 'medium' | 'hard';
type Pair = [string, string];
type ScheduleEntry = { easy: Pair; medium: Pair; hard: Pair };
type Schedule = Record<string, ScheduleEntry>;

// ── Arg parsing (matches generatePuzzle.ts conventions) ─────────────────────────

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

const DAYS = getNumArg('--days', 14);
const TZ = getStrArg('--tz', 'America/New_York');
const START_OVERRIDE = getStrArg('--start', '');

// ── Paths ─────────────────────────────────────────────────────────────────────

const schedulePath = path.join(process.cwd(), 'data/daily-schedule.json');
const poolPath = path.join(process.cwd(), 'data/pair-pool.txt');
const blockedWordsPath = path.join(process.cwd(), 'data/blocked-words.txt');
const blockedPairsPath = path.join(process.cwd(), 'data/blocked-pairs.txt');

// Same move-count bands as TIER_MOVE_RANGE in apps/web/src/lib/generatePuzzle.ts —
// keep these in sync if that file's tiers ever change.
const TIER_MOVE_RANGE: Record<Tier, [number, number]> = {
    easy:   [4, 4],
    medium: [5, 5],
    hard:   [6, 7],
};

// ── Date helpers ──────────────────────────────────────────────────────────────

// 'en-CA' locale formats Intl dates as 'YYYY-MM-DD' — mirrors getTodayKey() in
// apps/web/src/lib/generatePuzzle.ts so this script's notion of "today" matches
// the app's fixed daily-rollover timezone.
function formatDateInTz(date: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
}

// Pure calendar-day arithmetic — anchor at UTC noon so the date never shifts
// across a DST boundary during the add.
function addDays(dateKey: string, days: number): string {
    const d = new Date(`${dateKey}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
}

// ── Pair pool ─────────────────────────────────────────────────────────────────

// Mirrors loadPairPool() in apps/web/src/lib/generatePuzzle.ts.
function loadPairPool(): Record<Tier, Pair[]> {
    const pool: Record<Tier, Pair[]> = { easy: [], medium: [], hard: [] };
    if (!fs.existsSync(poolPath)) return pool;

    for (const line of fs.readFileSync(poolPath, 'utf-8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const [pairPart] = trimmed.split('#');
        const [startRaw, targetRaw] = (pairPart ?? '').split(',');
        const start = startRaw?.trim().toUpperCase();
        const target = targetRaw?.trim().toUpperCase();
        if (!start || !target) continue;

        const tierMatch = trimmed.match(/tier=(easy|medium|hard)/);
        const tier = tierMatch?.[1] as Tier | undefined;
        if (tier && pool[tier]) pool[tier].push([start, target]);
    }

    return pool;
}

function shuffle<T>(arr: T[]): T[] {
    return [...arr].sort(() => Math.random() - 0.5);
}

// Order-independent identity for a pair, so START→TARGET and TARGET→START
// count as the same puzzle for repeat-avoidance and blocklist purposes.
function pairKey(a: string, b: string): string {
    return [a, b].sort().join('|');
}

function loadBlockedWords(): Set<string> {
    const blocked = new Set<string>();
    try {
        fs.readFileSync(blockedWordsPath, 'utf-8')
            .split('\n')
            .map((l) => l.trim().toUpperCase())
            .filter((l) => l.length > 0 && !l.startsWith('#'))
            .forEach((w) => blocked.add(w));
    } catch {}
    return blocked;
}

function loadBlockedPairs(): Set<string> {
    const blocked = new Set<string>();
    try {
        fs.readFileSync(blockedPairsPath, 'utf-8')
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith('#'))
            .forEach((l) => {
                const [a, b] = l.split(',').map((w) => w.trim().toUpperCase());
                if (a && b) blocked.add(pairKey(a, b));
            });
    } catch {}
    return blocked;
}

function isPairAllowed(
    a: string,
    b: string,
    blockedWords: Set<string>,
    blockedPairs: Set<string>,
): boolean {
    if (blockedWords.has(a) || blockedWords.has(b)) return false;
    if (blockedPairs.has(pairKey(a, b))) return false;
    return true;
}

// Fallback for tiers with no (remaining) pool coverage — random BFS search
// validated against computeDifficultyProfile, same idea as generatePuzzle.ts's
// difficulty-preset random search.
function findFallbackPair(
    tier: Tier,
    candidates: string[],
    wordSet: Set<string>,
    usedKeys: Set<string>,
    blockedWords: Set<string>,
    blockedPairs: Set<string>,
): Pair | null {
    const [minMoves, maxMoves] = TIER_MOVE_RANGE[tier];
    const MAX_ATTEMPTS = 20_000;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const start = candidates[Math.floor(Math.random() * candidates.length)];
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        if (start === target) continue;
        if (!isPairAllowed(start, target, blockedWords, blockedPairs)) continue;

        const key = pairKey(start, target);
        if (usedKeys.has(key)) continue;

        const p = bfsShortestPath(start, target, wordSet);
        if (!p) continue;

        const moves = p.length - 1;
        if (moves < minMoves || moves > maxMoves) continue;

        const profile = computeDifficultyProfile(p, wordSet);
        if (profile.difficultyTier !== tier) continue;

        return [start, target];
    }

    return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
    const pool = loadPairPool();
    const allWords = loadPuzzleWords();
    const wordSet = createWordSet(allWords);
    const commonWords = loadCommonWords();
    const candidates = allWords.filter((w) => w.length === 4 && commonWords.has(w));
    const blockedWords = loadBlockedWords();
    const blockedPairs = loadBlockedPairs();

    let schedule: Schedule = {};
    try {
        schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf-8')) as Schedule;
    } catch {
        console.warn('No existing schedule found at data/daily-schedule.json — starting fresh.\n');
    }

    // Every pair already used anywhere in the schedule (any tier, any date) is off-limits.
    const usedKeys = new Set<string>();
    for (const entry of Object.values(schedule)) {
        for (const tier of ['easy', 'medium', 'hard'] as Tier[]) {
            const [a, b] = entry[tier];
            usedKeys.add(pairKey(a, b));
        }
    }

    const todayKey = formatDateInTz(new Date(), TZ);
    const startDate = START_OVERRIDE || addDays(todayKey, 1);

    console.log(`Generating up to ${DAYS} day(s) starting ${startDate} (tz=${TZ})…\n`);

    const newEntries: Schedule = {};
    let generated = 0;
    let cursor = startDate;
    let safety = 0;

    // Cap on calendar days scanned, not on --days requested — existing entries
    // can be sparse (e.g. refilling a few scattered gaps far apart), so the scan
    // must be able to walk past a long contiguous run of already-filled dates.
    const MAX_DAYS_SCANNED = 730;
    while (generated < DAYS && safety < MAX_DAYS_SCANNED) {
        safety++;

        if (schedule[cursor] || newEntries[cursor]) {
            // Date already scheduled — don't overwrite, move to the next day.
            cursor = addDays(cursor, 1);
            continue;
        }

        const dayPairs: Partial<ScheduleEntry> = {};
        let ok = true;

        for (const tier of ['easy', 'medium', 'hard'] as Tier[]) {
            const fromPool = shuffle(pool[tier]).find(
                ([a, b]) => !usedKeys.has(pairKey(a, b)) && isPairAllowed(a, b, blockedWords, blockedPairs),
            );
            const picked =
                fromPool ?? findFallbackPair(tier, candidates, wordSet, usedKeys, blockedWords, blockedPairs);

            if (!picked) {
                console.warn(`  Could not find a fresh ${tier} pair for ${cursor} — stopping early.`);
                ok = false;
                break;
            }

            usedKeys.add(pairKey(picked[0], picked[1]));
            dayPairs[tier] = picked;
        }

        if (!ok) break;

        const entry = dayPairs as ScheduleEntry;
        newEntries[cursor] = entry;
        console.log(
            `  ${cursor}   easy: ${entry.easy.join(' → ')}   medium: ${entry.medium.join(' → ')}   hard: ${entry.hard.join(' → ')}`,
        );
        generated++;
        cursor = addDays(cursor, 1);
    }

    const merged: Schedule = { ...schedule, ...newEntries };
    const sorted: Schedule = {};
    for (const key of Object.keys(merged).sort()) sorted[key] = merged[key];

    fs.writeFileSync(schedulePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    console.log(
        `\nWrote ${generated} new day(s) to data/daily-schedule.json (${Object.keys(sorted).length} total entries). Review before deploying.`,
    );
}

main();
