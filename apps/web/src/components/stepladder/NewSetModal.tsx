import type { Tier } from '@/lib/generatePuzzle';
import { TIERS, TIER_EMOJI, TIER_LABELS } from './constants';

type PuzzleStatus = 'not-started' | 'in-progress' | 'passed' | 'failed';
type FeedbackRating = 'good' | 'bad';

interface Props {
    puzzleStatuses: Record<Tier, PuzzleStatus>;
    ratings: Partial<Record<Tier, FeedbackRating>>;
    onRatingChange: (tier: Tier, rating: FeedbackRating | undefined) => void;
    onSubmit: (skip: boolean) => void;
    onClose: () => void;
}

// New Set modal — collects optional per-tier thumbs ratings before rolling a new puzzle set.
export function NewSetModal({ puzzleStatuses, ratings, onRatingChange, onSubmit, onClose }: Props) {
    const anyCompleted = TIERS.some(
        (t) => puzzleStatuses[t] === 'passed' || puzzleStatuses[t] === 'failed',
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}>
            <div
                className="bg-[var(--background)] border rounded-lg p-6 w-full max-w-sm mx-4 flex flex-col gap-5"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-bold">New puzzle set?</h2>
                        <p className="text-sm opacity-60 mt-1">
                            {anyCompleted ? 'Rate the puzzles you played — or skip.' : 'Your progress will be lost.'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="opacity-40 hover:opacity-100 text-lg leading-none px-1 ml-2 mt-0.5">
                        ✕
                    </button>
                </div>

                {anyCompleted && (
                    <div className="flex flex-col gap-3">
                        {TIERS.map((tier) => {
                            const status = puzzleStatuses[tier];
                            const isComplete = status === 'passed' || status === 'failed';
                            return (
                                <div key={tier} className="flex items-center justify-between">
                                    <span className="text-sm font-medium flex items-center gap-2">
                                        <span>{TIER_EMOJI[tier]}</span>
                                        <span>{TIER_LABELS[tier]}</span>
                                    </span>
                                    {isComplete ? (
                                        <div className="flex gap-2">
                                            {(['good', 'bad'] as FeedbackRating[]).map((rating) => (
                                                <button
                                                    key={rating}
                                                    onClick={() =>
                                                        onRatingChange(tier, ratings[tier] === rating ? undefined : rating)
                                                    }
                                                    className={[
                                                        'border rounded-lg px-3 py-2 text-lg transition-all',
                                                        ratings[tier] === rating
                                                            ? rating === 'good'
                                                                ? 'border-green-500 bg-green-500/10'
                                                                : 'border-red-500 bg-red-500/10'
                                                            : 'opacity-40 hover:opacity-70',
                                                    ].join(' ')}>
                                                    {rating === 'good' ? '👍' : '👎'}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-xs opacity-30 italic">not played</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex gap-3 pt-1">
                    <button
                        onClick={onClose}
                        className="text-sm opacity-40 hover:opacity-70 transition-opacity flex-1 py-2 text-center">
                        Cancel
                    </button>
                    <button
                        onClick={() => onSubmit(!anyCompleted)}
                        className="border-2 border-yellow-400 rounded px-4 py-2 text-sm font-semibold flex-1">
                        {anyCompleted ? 'Submit & continue' : 'Continue'}
                    </button>
                </div>
            </div>
        </div>
    );
}
