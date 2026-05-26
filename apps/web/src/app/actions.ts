'use server';

export interface FeedbackPayload {
    start: string;
    target: string;
    optimalPathLength: number;
    movesTaken: number;
    solved: boolean;
    rating: 'good' | 'bad';
    reason: string;
    timestamp: string;
}

export interface WordReportPayload {
    word: string;
    kind: 'missing' | 'bad';
    /** Puzzle context — useful for understanding which games triggered the report. */
    start: string;
    target: string;
    timestamp: string;
}

/**
 * Receives puzzle quality feedback (good/bad + reason).
 * TODO: wire to Supabase once the database is set up.
 */
export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
    console.log('[feedback]', payload);
}

/**
 * Receives a word report:
 *   kind=missing → player thinks this word should be in the dictionary
 *   kind=bad     → player thinks this word shouldn't appear in puzzles
 * TODO: wire to Supabase once the database is set up.
 */
export async function submitWordReport(
    payload: WordReportPayload,
): Promise<void> {
    console.log('[word-report]', payload);
}
