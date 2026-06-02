/**
 * Analyzes each letter position in a word and reports how many valid
 * neighbors (one-letter-change moves) exist at that position.
 *
 * Useful for evaluating puzzle words. A position with few branches
 * means the player has limited options there — that step may feel forced.
 * A position with many branches means many escape routes exist.
 *
 * Usage:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/analyzeLetterBranches.ts WORD [WORD2 ...]
 *
 * Examples:
 *   # Single word
 *   ... analyzeLetterBranches.ts COLD
 *
 *   # Analyze both endpoints of a puzzle
 *   ... analyzeLetterBranches.ts COLD WARM
 *
 *   # Analyze every word on a path
 *   ... analyzeLetterBranches.ts COLD CORD WORD WARD WARM
 */

import { loadPuzzleWords, createWordSet } from '@repo/dictionary';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── Core analysis ─────────────────────────────────────────────────────────────

type PositionAnalysis = {
    position: number;
    letter: string;
    neighbors: string[];
};

function analyzeWord(
    word: string,
    wordSet: Set<string>,
): { exists: boolean; positions: PositionAnalysis[]; totalNeighbors: number } {
    const positions: PositionAnalysis[] = [];
    let totalNeighbors = 0;

    for (let i = 0; i < word.length; i++) {
        const neighbors: string[] = [];

        for (const letter of ALPHABET) {
            if (letter === word[i]) continue;
            const candidate = word.slice(0, i) + letter + word.slice(i + 1);
            if (wordSet.has(candidate)) {
                neighbors.push(candidate);
            }
        }

        totalNeighbors += neighbors.length;
        positions.push({ position: i + 1, letter: word[i], neighbors });
    }

    return { exists: wordSet.has(word), positions, totalNeighbors };
}

// ── Display ───────────────────────────────────────────────────────────────────

function printAnalysis(word: string, wordSet: Set<string>): void {
    const w = word.trim().toUpperCase();
    const { exists, positions, totalNeighbors } = analyzeWord(w, wordSet);

    const notInSet = exists ? '' : '  ⚠ not in puzzle word set';
    console.log(`\n── ${w}${notInSet} ${'─'.repeat(Math.max(0, 44 - w.length))}`);

    for (const { position, letter, neighbors } of positions) {
        const count = neighbors.length;
        const bar = count === 0 ? '(locked)' : `${count} branch${count === 1 ? '' : 'es'}`;
        console.log(`  Position ${position} · ${letter}:  ${bar}`);
        if (neighbors.length > 0) {
            // Group into rows of 10 for readability
            for (let i = 0; i < neighbors.length; i += 10) {
                console.log(`    ${neighbors.slice(i, i + 10).join('  ')}`);
            }
        }
    }

    console.log(`  ${'─'.repeat(40)}`);
    console.log(`  Total neighbors: ${totalNeighbors}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const words = process.argv.slice(2).filter((a) => !a.startsWith('--'));

if (words.length === 0) {
    console.error('Usage: analyzeLetterBranches.ts WORD [WORD2 ...]');
    console.error('Example: analyzeLetterBranches.ts COLD WARM');
    process.exit(1);
}

const wordSet = createWordSet(loadPuzzleWords());

for (const word of words) {
    printAnalysis(word, wordSet);
}

console.log();
