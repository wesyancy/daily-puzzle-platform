import {
    loadDictionary,
    filterWords,
    filterBannedWords,
    createWordSet,
    getNeighbors,
} from '@repo/dictionary';

const rawWords = loadDictionary();

const filteredWords = filterWords(rawWords);

const cleanedWords = filterBannedWords(filteredWords);

const wordSet = createWordSet(cleanedWords);

console.log('Total filtered words:', cleanedWords.length);

console.log('Neighbors of COLD:', getNeighbors('COLD', wordSet));
