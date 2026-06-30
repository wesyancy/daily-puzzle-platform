/**
 * Validates data/daily-schedule.json — the regression check for the bug
 * that prompted this script: a generated batch once included RAPE→SURE
 * because the generator wasn't consulting the blocklists. This re-checks
 * every entry against the same policies validateWordPairs.ts enforces for
 * word-pairs.txt, plus schedule-specific checks (BFS path actually exists,
 * no duplicate pair reused across dates/tiers).
 *
 * Unlike validateWordPairs.ts, this does NOT rewrite the file — a failing
 * entry means a specific date has no valid puzzle, which needs a human
 * decision about what replaces it, not a silent drop. Exits with code 1 if
 * anything fails, so it can gate CI or be run after every
 * generateDailySchedule.ts invocation.
 *
 * Usage:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/validateDailySchedule.ts
 */

import fs from 'fs';
import path from 'path';

import { loadPuzzleWords, createWordSet } from '@repo/dictionary';
import { bfsShortestPath } from '@repo/game-engine';

type Tier = 'easy' | 'medium' | 'hard';
type Pair = [string, string];
type ScheduleEntry = { easy: Pair; medium: Pair; hard: Pair };
type Schedule = Record<string, ScheduleEntry>;

// Letters banned from puzzle start/target words — matches validateWordPairs.ts.
const RARE_LETTERS = new Set(['J', 'Z', 'V']);

function loadLines(file: string): string[] {
    const filePath = path.join(process.cwd(), file);
    try {
        return fs
            .readFileSync(filePath, 'utf-8')
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith('#'));
    } catch {
        return [];
    }
}

const BLOCKED_WORDS = new Set(loadLines('data/blocked-words.txt'));
const BLOCKED_PAIRS = new Set(loadLines('data/blocked-pairs.txt'));

type CheckResult = { pass: true } | { pass: false; reason: string };

function checkPair(start: string, target: string, wordSet: Set<string>): CheckResult {
    if (BLOCKED_WORDS.has(start)) return { pass: false, reason: `"${start}" is a blocked word` };
    if (BLOCKED_WORDS.has(target)) return { pass: false, reason: `"${target}" is a blocked word` };

    if (BLOCKED_PAIRS.has(`${start},${target}`) || BLOCKED_PAIRS.has(`${target},${start}`)) {
        return { pass: false, reason: 'blocked pair' };
    }

    const rareInStart = [...start].find((c) => RARE_LETTERS.has(c));
    const rareInTarget = [...target].find((c) => RARE_LETTERS.has(c));
    if (rareInStart ?? rareInTarget) {
        const which = rareInStart ? `"${start}" contains ${rareInStart}` : `"${target}" contains ${rareInTarget}`;
        return { pass: false, reason: which };
    }

    if (!wordSet.has(start)) return { pass: false, reason: `"${start}" not in word set` };
    if (!wordSet.has(target)) return { pass: false, reason: `"${target}" not in word set` };

    const p = bfsShortestPath(start, target, wordSet);
    if (!p) return { pass: false, reason: 'no path exists — would crash buildTieredPuzzle() at runtime' };

    return { pass: true };
}

function pairKey(a: string, b: string): string {
    return [a, b].sort().join('|');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const schedulePath = path.join(process.cwd(), 'data/daily-schedule.json');
const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf-8')) as Schedule;
const wordSet = createWordSet(loadPuzzleWords());

let failures = 0;
const seenPairs = new Map<string, string>(); // pairKey -> "date/tier" of first occurrence

const dates = Object.keys(schedule).sort();
console.log(`Validating ${dates.length} schedule entr${dates.length === 1 ? 'y' : 'ies'}…\n`);

for (const date of dates) {
    const entry = schedule[date];
    for (const tier of ['easy', 'medium', 'hard'] as Tier[]) {
        const [start, target] = entry[tier];
        const label = `${date} ${tier}`;

        const result = checkPair(start, target, wordSet);
        if (!result.pass) {
            console.log(`  ✗  ${label.padEnd(20)} ${start} → ${target}   ${result.reason}`);
            failures++;
            continue;
        }

        const key = pairKey(start, target);
        const firstSeen = seenPairs.get(key);
        if (firstSeen) {
            console.log(`  ✗  ${label.padEnd(20)} ${start} → ${target}   duplicate of ${firstSeen}`);
            failures++;
            continue;
        }
        seenPairs.set(key, label);

        console.log(`  ✓  ${label.padEnd(20)} ${start} → ${target}`);
    }
}

console.log(`\n${failures === 0 ? 'All entries pass.' : `${failures} failure(s) found — fix before deploying.`}\n`);
process.exit(failures === 0 ? 0 : 1);
