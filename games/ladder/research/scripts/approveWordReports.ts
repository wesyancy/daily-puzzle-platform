/**
 * Interactive word report approval tool.
 * Fetches submitted word reports from Supabase, lets you approve or deny each,
 * then automatically adds approved words to the game.
 *
 * Usage:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/approveWordReports.ts
 *
 * Reads credentials from apps/web/.env.local automatically.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';
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

// ── Supabase ──────────────────────────────────────────────────────────────────

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
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function createPrompter() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));
    const close = () => rl.close();
    return { ask, close };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function puzzleList(reports: WordReport[]): string {
    return [...new Set(reports.map((r) => `${r.start}→${r.target}`))].join(', ');
}

function gateReason(word: string, puzzleWords: Set<string>, commonWords: Set<string>): string {
    if (word.length < 4 || word.length > 5) return `wrong length (${word.length} letters)`;
    if (bannedWords.has(word)) return 'profanity';
    if (puzzleWords.has(word)) return 'already in game';
    if (!commonWords.has(word)) return 'not in common words list';
    return 'eligible (in common words, not yet in game)';
}

function groupByWord(reports: WordReport[]): Map<string, WordReport[]> {
    const map = new Map<string, WordReport[]>();
    for (const r of reports) {
        const w = r.word.trim().toUpperCase();
        if (!map.has(w)) map.set(w, []);
        map.get(w)!.push(r);
    }
    return map;
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

    console.log(`\n── Approve Word Reports ${'─'.repeat(37)}`);
    console.log(`Fetched ${reports.length} reports  (${missing.length} missing · ${bad.length} bad)\n`);

    const puzzleWords = createWordSet(loadPuzzleWords());
    const commonWords = loadCommonWords();
    const { ask, close } = createPrompter();

    const approvedMissing: string[] = [];
    const deniedMissing: string[] = [];
    const approvedBad: string[] = [];

    // ── Missing words ─────────────────────────────────────────────────────────

    const missingByWord = groupByWord(missing);

    // Partition: auto-skip vs review queue
    const autoSkipped: { word: string; reason: string }[] = [];
    const reviewQueue: [string, WordReport[]][] = [];

    for (const [word, wordReports] of missingByWord) {
        const len = word.length;
        if (len < 4 || len > 5) {
            autoSkipped.push({ word, reason: `wrong length (${len} letters)` });
        } else if (bannedWords.has(word)) {
            autoSkipped.push({ word, reason: 'profanity — auto-blocked' });
        } else if (puzzleWords.has(word)) {
            autoSkipped.push({ word, reason: 'already in game' });
        } else {
            reviewQueue.push([word, wordReports]);
        }
    }

    if (autoSkipped.length > 0) {
        console.log('Auto-skipped:');
        for (const { word, reason } of autoSkipped) {
            console.log(`  ${word.padEnd(6)} — ${reason}`);
        }
        console.log();
    }

    if (reviewQueue.length === 0) {
        console.log('No missing words to review.\n');
    } else {
        console.log(`Reviewing ${reviewQueue.length} missing word${reviewQueue.length > 1 ? 's' : ''}...\n`);

        for (let i = 0; i < reviewQueue.length; i++) {
            const [word, wordReports] = reviewQueue[i];
            const count = wordReports.length;
            const reason = gateReason(word, puzzleWords, commonWords);
            const puzzles = puzzleList(wordReports);

            console.log(`── Word ${i + 1} of ${reviewQueue.length} ${'─'.repeat(40)}`);
            console.log(`${word.padEnd(6)} [${count} report${count > 1 ? 's' : ''} · puzzles: ${puzzles}]`);
            console.log(`       Gate: ${reason}`);

            const answer = await ask('Add to game? [y/n]: ');
            if (answer.trim().toLowerCase() === 'y') {
                approvedMissing.push(word);
            } else {
                deniedMissing.push(word);
            }
            console.log();
        }
    }

    // ── Bad words ─────────────────────────────────────────────────────────────

    const badByWord = groupByWord(bad);

    if (badByWord.size > 0) {
        console.log(`── Bad words ${'─'.repeat(47)}`);
        console.log('These words were flagged as inappropriate by players.\n');

        for (const [word, wordReports] of badByWord) {
            const count = wordReports.length;
            const puzzles = puzzleList(wordReports);
            console.log(`${word.padEnd(6)} [${count} report${count > 1 ? 's' : ''} · puzzles: ${puzzles}]`);
            const answer = await ask('Block as puzzle start/target? [y/n]: ');
            if (answer.trim().toLowerCase() === 'y') {
                approvedBad.push(word);
            }
            console.log();
        }
    }

    close();

    // ── Apply changes ─────────────────────────────────────────────────────────

    if (approvedMissing.length === 0 && approvedBad.length === 0) {
        console.log('No changes made.');
        return;
    }

    const commonWordsPath = path.join(
        process.cwd(),
        '../../packages/dictionary/src/data/commonWords.txt',
    );
    const puzzleWordsPath = path.join(
        process.cwd(),
        '../../packages/dictionary/src/data/puzzle-words.txt',
    );
    const blockedWordsPath = path.join(process.cwd(), 'data/blocked-words.txt');

    if (approvedMissing.length > 0) {
        // Append to commonWords.txt (lowercase, one per line)
        const toAppend = approvedMissing.map((w) => w.toLowerCase()).join('\n') + '\n';
        fs.appendFileSync(commonWordsPath, toAppend, 'utf-8');
        console.log(`Appended ${approvedMissing.length} word(s) to commonWords.txt`);

        // Rebuild puzzle-words.txt
        console.log('Rebuilding puzzle-words.txt...');
        execSync('npx tsx research/scripts/buildWordList.ts', {
            cwd: process.cwd(),
            stdio: 'inherit',
        });

        // Verify each approved word made it in; add directly if not (not in enable1.txt)
        const newPuzzleWords = createWordSet(loadPuzzleWords());
        const addedDirectly: string[] = [];

        for (const word of approvedMissing) {
            if (!newPuzzleWords.has(word)) {
                // Word isn't in enable1.txt — add directly to puzzle-words.txt
                fs.appendFileSync(puzzleWordsPath, word + '\n', 'utf-8');
                addedDirectly.push(word);
            }
        }

        if (addedDirectly.length > 0) {
            console.log(
                `Note: ${addedDirectly.join(', ')} not found in enable1.txt — added directly to puzzle-words.txt`,
            );
        }
    }

    if (approvedBad.length > 0) {
        const toAppend = approvedBad.map((w) => w.toUpperCase()).join('\n') + '\n';
        fs.appendFileSync(blockedWordsPath, toAppend, 'utf-8');
        console.log(`Added ${approvedBad.length} word(s) to blocked-words.txt`);
    }

    // ── Summary ───────────────────────────────────────────────────────────────

    console.log(`\n── Done ${'─'.repeat(52)}`);
    console.log(`Added to game (${approvedMissing.length}):  ${approvedMissing.join(', ') || '—'}`);
    console.log(`Denied (${deniedMissing.length}):           ${deniedMissing.join(', ') || '—'}`);
    console.log(`Blocked as bad (${approvedBad.length}):     ${approvedBad.join(', ') || '—'}`);

    if (approvedMissing.length > 0 || approvedBad.length > 0) {
        console.log(
            '\nReminder: run validateWordPairs.ts to check if new words affect pair quality.',
        );
    }
    console.log();
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
