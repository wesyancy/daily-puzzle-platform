import fs from 'fs';
import path from 'path';

export function loadCommonWords(): Set<string> {
    const filePath = path.join(__dirname, '../data/commonWords.txt');

    const contents = fs.readFileSync(filePath, 'utf-8');

    const words = contents
        .split('\n')
        .map((word) => word.trim().toUpperCase())
        .filter((word) => word.length > 0);

    return new Set(words);
}
