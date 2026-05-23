import prompts from 'prompts';

import {
    loadDictionary,
    filterWords,
    filterBannedWords,
    createWordSet,
    loadCommonWords,
    filterCommonWords,
} from '@repo/dictionary';

import { isValidMove } from './validation/isValidMove';

import { bfsShortestPath } from './solver/bfsShortestPath';

const START = 'COLD';
const TARGET = 'WARM';

async function playGame() {
    const rawWords = loadDictionary();
    const filteredWords = filterWords(rawWords);

    const cleanedWords = filterBannedWords(filteredWords);

    const commonWords = loadCommonWords();

    const finalWords = filterCommonWords(cleanedWords, commonWords);
    const wordSet = createWordSet(finalWords);

    let currentWord = START;

    const moveHistory = [START];

    console.clear();

    console.log('=== DAILY LADDER ===');
    console.log('');
    console.log(`Start: ${START}`);
    console.log(`Target: ${TARGET}`);
    console.log('');

    while (currentWord !== TARGET) {
        console.log(`Current Word: ${currentWord}`);

        const response = await prompts({
            type: 'text',
            name: 'guess',
            message: 'Next word:',
        });

        const nextWord = response.guess?.trim().toUpperCase();

        if (!nextWord) {
            continue;
        }

        const validMove = isValidMove(currentWord, nextWord, wordSet);

        if (!validMove) {
            console.log('');
            console.log('❌ Invalid move.');
            console.log('Change exactly one letter and use a valid word.');
            console.log('');

            continue;
        }

        currentWord = nextWord;

        moveHistory.push(nextWord);

        console.log('');
        console.log(`✅ Accepted: ${nextWord}`);
        console.log('');
    }

    console.log('');
    console.log('🎉 Puzzle Solved!');
    console.log('');

    console.log('Your Path:');

    console.log(moveHistory.join(' → '));

    const optimalPath = bfsShortestPath(START, TARGET, wordSet);

    console.log('');

    console.log(`Your Moves: ${moveHistory.length - 1}`);

    console.log(
        `Optimal Moves: ${optimalPath ? optimalPath.length - 1 : 'Unknown'}`,
    );

    console.log('');

    if (optimalPath) {
        console.log('Optimal Path:');

        console.log(optimalPath.join(' → '));
    }
}

playGame();
