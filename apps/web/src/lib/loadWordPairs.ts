import fs from 'fs';
import path from 'path';

/**
 * Loads validated word pairs from games/ladder/data/word-pairs.txt.
 * Returns an array of [start, target] tuples (both uppercase).
 *
 * Lines starting with # are treated as comments and ignored.
 */
export function loadWordPairs(): [string, string][] {
    const filePath = path.join(
        process.cwd(),
        '../../games/ladder/data/word-pairs.txt',
    );

    return fs
        .readFileSync(filePath, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .map((line) => {
            const [a, b] = line.split(',');
            return [a.trim().toUpperCase(), b.trim().toUpperCase()] as [
                string,
                string,
            ];
        });
}
