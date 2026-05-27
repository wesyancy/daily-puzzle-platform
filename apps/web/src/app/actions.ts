'use server';

import { supabase } from '@/lib/supabase';

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

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
    const { error } = await supabase.from('puzzle_feedback').insert({
        start: payload.start,
        target: payload.target,
        optimal_path_length: payload.optimalPathLength,
        moves_taken: payload.movesTaken,
        solved: payload.solved,
        rating: payload.rating,
        reason: payload.reason,
    });

    if (error) {
        console.error('[feedback] Supabase insert failed:', error.message);
    }
}

export async function submitWordReport(payload: WordReportPayload): Promise<void> {
    const { error } = await supabase.from('word_reports').insert({
        word: payload.word,
        kind: payload.kind,
        start: payload.start,
        target: payload.target,
    });

    if (error) {
        console.error('[word-report] Supabase insert failed:', error.message);
    }
}
