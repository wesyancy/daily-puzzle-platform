import {
    loadDictionary,
    filterWords,
    filterBannedWords,
    createWordSet,
    loadCommonWords,
    filterCommonWords,
} from '@repo/dictionary';

import { calculateLetterSimilarity } from './calculateLetterSimilarity';

import { bfsShortestPath } from '../../solver/bfsShortestPath';

function randomItem<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

const rawWords = loadDictionary();

const filteredWords = filterWords(rawWords);

const cleanedWords = filterBannedWords(filteredWords);

const commonWords = loadCommonWords();

const finalWords = filterCommonWords(cleanedWords, commonWords);

const wordSet = createWordSet(finalWords);

const candidateWords = finalWords.filter((word) => word.length === 4);

while (true) {
    const start = randomItem(candidateWords);

    const target = randomItem(candidateWords);

    if (start === target) {
        continue;
    }

    const path = bfsShortestPath(start, target, wordSet);

    if (!path) {
        continue;
    }

    if (path.length >= 4 && path.length <= 6) {
        console.log('');
        console.log(`${start} → ${target}`);

        console.log(`Optimal Length: ${path.length - 1}`);

        console.log(path.join(' → '));

        console.log(
            `Position Similarity: ${calculateLetterSimilarity(start, target)}`,
        );

        break;
    }
}
