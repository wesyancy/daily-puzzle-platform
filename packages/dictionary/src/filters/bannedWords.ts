/**
 * Words excluded from puzzle generation entirely.
 * Includes profanity and slurs — kept explicit so the list is auditable.
 *
 * To regenerate puzzle-words.txt after changes here, run:
 *   pnpm --filter @repo/ladder exec npx tsx research/scripts/buildWordList.ts
 */
export const bannedWords = new Set<string>([
    // 4-letter
    'ANAL',
    'ANUS',
    'ARSE',
    'BUTT',
    'CLIT',
    'COCK',
    'CRAP',
    'CUNT',
    'DAMN',
    'DICK',
    'DYKE',
    'FUCK',
    'PISS',
    'BOOB',
    'POOP',
    'PORN',
    'SHIT',
    'SLAG',
    'SLUT',
    'TITS',
    'TWAT',
    // 5-letter
    'BALLS',
    'BITCH',
    'BOOBS',
    'BOOBY',
    'BONER',
    'DILDO',
    'FANNO',
    'PORNO',
    'PUSSY',
    'TAINT',
    'TITTY',
    'VULVA',
    'WANKS',
    'WHORE',
]);
