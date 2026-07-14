import type { Tier } from '@/lib/generatePuzzle';
import { TIER_EMOJI, TIER_NUMBER, TIER_LABELS } from './constants';

interface Props {
    start: string;
    target: string;
    activeTier: Tier;
    optimalMoves: number;
    message: string;
}

// Game Status Area — Start→Target display, tier label, shortest path, and inline error.
export function GameStatusArea({ start, target, activeTier, optimalMoves, message }: Props) {
    return (
        <>
            <div className="flex items-center justify-center gap-6">
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs uppercase tracking-widest opacity-40">Start</span>
                    <span className="text-4xl font-mono font-semibold">{start}</span>
                </div>
                <span className="text-lg opacity-30">→</span>
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs uppercase tracking-widest opacity-40">Target</span>
                    <span className="text-4xl font-mono font-semibold">{target}</span>
                </div>
            </div>

            {/* Status line — tier number and shortest path count */}
            <div className="flex flex-col gap-0.5 text-center">
                <span className="text-xs uppercase tracking-wide opacity-50">
                    {TIER_EMOJI[activeTier]} Puzzle {TIER_NUMBER[activeTier]} of 3 · {TIER_LABELS[activeTier]}
                </span>
                <span className="text-sm opacity-60">
                    Shortest path: {optimalMoves} moves
                </span>
                {message && (
                    <p className="text-sm text-red-500 dark:text-red-400 mt-1">{message}</p>
                )}
            </div>
        </>
    );
}
