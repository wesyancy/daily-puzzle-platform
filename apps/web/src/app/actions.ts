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

// Returns what fraction of today's solved players took more moves than movesTaken,
// expressed as 0–100. Returns null when fewer than 20 completions exist for that tier+date
// (too small a sample to show a meaningful number) or if the query fails.
// dateStr must be 'YYYY-MM-DD' in UTC — matches created_at timestamps stored as UTC.
export async function getDailyPercentile(
    tier: string,
    dateStr: string,
    movesTaken: number,
): Promise<number | null> {
    const start = new Date(`${dateStr}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const { data, error } = await supabase
        .from('game_events')
        .select('payload')
        .eq('game_id', 'stepladder')
        .eq('event_type', 'puzzle_completed')
        .eq('tier', tier)
        .filter('payload->>solved', 'eq', 'true')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString());

    if (error || !data || data.length < 20) return null;

    const beaten = data.filter((row) => {
        const payload = row.payload as { moves_taken?: number };
        return (payload.moves_taken ?? Infinity) > movesTaken;
    }).length;

    return Math.round((beaten / data.length) * 100);
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
