/**
 * Fetches word reports from Supabase and checks each against the validation
 * pipeline, producing an actionable report.
 *
 * Usage:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/reviewWordReports.ts
 *
 * Reads credentials from apps/web/.env.local automatically.
 */

import fs from 'fs';
import path from 'path';
import { loadPuzzleWords, loadCommonWords, bannedWords, createWordSet } from '@repo/dictionary';

// ── Env vars ─────────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
    const envPath = path.join(process.cwd(), '../../apps/web/.env.local');
    if (!fs.existsSync(envPath)) {
        throw new Error(`Could not find .env.local at ${envPath}`);
    }
    const env: Record<string, string> = {};
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    }
    return env;
}

// ── Supabase fetch ────────────────────────────────────────────────────────────

type WordReport = {
    id: string;
    word: string;
    kind: 'missing' | 'bad';
    start: string;
    target: string;
    created_at: string;
};

async function fetchReports(url: string, key: string): Promise<WordReport[]> {
    const res = await fetch(
        `${url}/rest/v1/word_reports?select=*&order=created_at.asc`,
        {
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
            },
        },
    );
    if (!res.ok) {
        throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
    }
    return res.json();
}

// ── Classification ────────────────────────────────────────────────────────────

type MissingResult =
    | { status: 'wrong-length' }
    | { status: 'profanity' }
    | { status: 'already-in-game' }
    | { status: 'not-common' }
    | { status: 'eligible' };

function classifyMissing(word: string, puzzleWords: Set<string>, commonWords: Set<string>): MissingResult {
    const w = word.trim().toUpperCase();
    if (w.length < 4 || w.length > 5) return { status: 'wrong-length' };
    if (bannedWords.has(w)) return { status: 'profanity' };
    if (puzzleWords.has(w)) return { status: 'already-in-game' };
    if (!commonWords.has(w)) return { status: 'not-common' };
    return { status: 'eligible' };
}

// ── Formatting ────────────────────────────────────────────────────────────────

function puzzleList(reports: WordReport[]): string {
    const pairs = [...new Set(reports.map((r) => `${r.start}→${r.target}`))];
    return pairs.join(', ');
}

function pad(s: string, len: number) {
    return s.padEnd(len);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const env = loadEnv();
    const supabaseUrl = env['SUPABASE_URL'];
    const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
    }

    const reports = await fetchReports(supabaseUrl, supabaseKey);
    const missing = reports.filter((r) => r.kind === 'missing');
    const bad = reports.filter((r) => r.kind === 'bad');

    console.log(`\n── Word Reports ${'─'.repeat(45)}`);
    console.log(`Fetched ${reports.length} reports  (${missing.length} missing · ${bad.length} bad)\n`);

    const puzzleWords = createWordSet(loadPuzzleWords());
    const commonWords = loadCommonWords();

    // Group by word
    const missingByWord = new Map<string, WordReport[]>();
    for (const r of missing) {
        const w = r.word.trim().toUpperCase();
        if (!missingByWord.has(w)) missingByWord.set(w, []);
        missingByWord.get(w)!.push(r);
    }

    const badByWord = new Map<string, WordReport[]>();
    for (const r of bad) {
        const w = r.word.trim().toUpperCase();
        if (!badByWord.has(w)) badByWord.set(w, []);
        badByWord.get(w)!.push(r);
    }

    // Buckets for summary
    const eligible: string[] = [];
    const alreadyInGame: string[] = [];
    const notCommon: string[] = [];
    const profanity: string[] = [];
    const wrongLength: string[] = [];

    if (missingByWord.size > 0) {
        console.log(`── Missing words ${'─'.repeat(44)}`);
        for (const [word, wordReports] of missingByWord) {
            const count = wordReports.length;
            const puzzles = puzzleList(wordReports);
            const result = classifyMissing(word, puzzleWords, commonWords);

            console.log(`${pad(word, 6)} [${count} report${count > 1 ? 's' : ''} · puzzles: ${puzzles}]`);

            switch (result.status) {
                case 'eligible':
                    console.log(`       ✓ Eligible — not currently in game`);
                    console.log(`       → Add to commonWords.txt, then run buildWordList.ts`);
                    eligible.push(word);
                    break;
                case 'already-in-game':
                    console.log(`       ✓ Already in game — player may not have known the one-letter rule`);
                    alreadyInGame.push(word);
                    break;
                case 'not-common':
                    console.log(`       ✗ Not in common words list — not a recognised common word`);
                    notCommon.push(word);
                    break;
                case 'profanity':
                    console.log(`       ✗ In profanity blocklist — already prevented`);
                    profanity.push(word);
                    break;
                case 'wrong-length':
                    console.log(`       ✗ Wrong length (${word.length} letters) — game uses 4–5 letter words`);
                    wrongLength.push(word);
                    break;
            }
            console.log();
        }
    }

    if (badByWord.size > 0) {
        console.log(`── Bad words ${'─'.repeat(47)}`);
        for (const [word, wordReports] of badByWord) {
            const count = wordReports.length;
            const puzzles = puzzleList(wordReports);
            console.log(`${pad(word, 6)} [${count} report${count > 1 ? 's' : ''} · puzzles: ${puzzles}]`);
            console.log(`       → Consider adding to games/ladder/data/blocked-words.txt`);
            console.log();
        }
    }

    // Summary
    console.log(`── Action summary ${'─'.repeat(42)}`);
    console.log(`Eligible to add (append to commonWords.txt + rebuild):  ${eligible.join(', ') || '—'}`);
    console.log(`Already in game (no action needed):                      ${alreadyInGame.join(', ') || '—'}`);
    console.log(`Not a common word (deny):                                ${notCommon.join(', ') || '—'}`);
    console.log(`Profanity (already blocked):                             ${profanity.join(', ') || '—'}`);
    console.log(`Wrong length (deny):                                     ${wrongLength.join(', ') || '—'}`);
    console.log();
    console.log(`Bad words to review for blocking:                        ${[...badByWord.keys()].join(', ') || '—'}`);
    console.log();
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
