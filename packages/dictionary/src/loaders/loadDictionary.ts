import fs from 'fs';
import path from 'path';

export function loadDictionary(): string[] {
    const filePath = path.join(
        process.cwd(),
        '../../packages/dictionary/src/data/enable1.txt',
    );

    const contents = fs.readFileSync(filePath, 'utf-8');

    return contents
        .split('\n')
        .map((word) => word.trim().toUpperCase())
        .filter((word) => word.length > 0);
}
