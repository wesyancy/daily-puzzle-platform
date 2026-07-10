'use server';

import { supabase } from '@/lib/supabase';
import type { GameEventType, EventPayload } from '@repo/analytics';

export interface FeedbackPayload {
    start: string;
    target: string;
    optimalPathLength: number;
    movesTaken: number;
    solved: boolean;
    rating: 'good' | 'bad';
    reason: string;
    timestamp: string;
    /** Which difficulty tier this puzzle was (easy/medium/hard in the trio format). */
    tier?: 'easy' | 'medium' | 'hard';
    /** Which game produced this feedback — defaults to 'stepladder'. */
    gameId?: string;
}

export interface WordReportPayload {
    word: string;
    kind: 'missing' | 'bad';
    /** Puzzle context — useful for understanding which games triggered the report. */
    start: string;
    target: string;
    timestamp: string;
    /** Which game produced this report — defaults to 'stepladder'. */
    gameId?: string;
}

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
    const { error } = await supabase.from('puzzle_feedback').insert({
        game_id: payload.gameId ?? 'stepladder',
        start: payload.start,
        target: payload.target,
        optimal_path_length: payload.optimalPathLength,
        moves_taken: payload.movesTaken,
        solved: payload.solved,
        rating: payload.rating,
        reason: payload.reason,
        tier: payload.tier ?? null,
    });

    if (error) {
        console.error('[feedback] Supabase insert failed:', error.message);
    }
}

export async function submitWordReport(payload: WordReportPayload): Promise<void> {
    const { error } = await supabase.from('word_reports').insert({
        game_id: payload.gameId ?? 'stepladder',
        word: payload.word,
        kind: payload.kind,
        start: payload.start,
        target: payload.target,
    });

    if (error) {
        console.error('[word-report] Supabase insert failed:', error.message);
    }
}

// Fire-and-forget event insert — never awaited by the caller.
// Service-role key stays server-only; the browser never touches Supabase directly.
export async function submitGameEvent(
    gameId: string,
    sessionId: string,
    eventType: GameEventType,
    tier: string | null,
    payload: EventPayload,
): Promise<void> {
    const { error } = await supabase.from('game_events').insert({
        game_id: gameId,
        session_id: sessionId,
        event_type: eventType,
        tier,
        payload,
    });

    if (error) {
        console.error('[analytics] Supabase insert failed:', error.message);
    }
}
