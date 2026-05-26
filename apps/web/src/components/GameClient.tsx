'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitFeedback, submitWordReport } from '@/app/actions';
import { ThemeToggle } from '@/components/ThemeToggle';

type Puzzle = {
    start: string;
    target: string;
    optimalPath: string[];
    neighborGraph: Record<string, string[]>;
};

type FeedbackRating = 'good' | 'bad';

type FeedbackState =
    | { stage: 'idle' }
    | { stage: 'asking'; rating: FeedbackRating }
    | { stage: 'submitted' };

type WordReportState =
    | { stage: 'idle' }
    | { stage: 'missing'; input: string }
    | { stage: 'bad'; selected: string | null }
    | { stage: 'submitted' };

const GOOD_REASONS = [
    'Great words',
    'Right difficulty',
    'Satisfying path',
    'Felt clever',
];

const BAD_REASONS = [
    'Too easy',
    'Too hard',
    'Obscure words',
    'Felt random',
];

export default function GameClient({
    initialPuzzle,
}: {
    initialPuzzle: Puzzle;
}) {
    const router = useRouter();

    const [puzzle] = useState(initialPuzzle);
    const [moves, setMoves] = useState<string[]>([puzzle.start]);
    const [input, setInput] = useState('');
    const [message, setMessage] = useState('');
    const [feedback, setFeedback] = useState<FeedbackState>({ stage: 'idle' });
    const [wordReport, setWordReport] = useState<WordReportState>({
        stage: 'idle',
    });

    const currentWord = moves[moves.length - 1];
    const solved = currentWord === puzzle.target;

    // Words the player can flag as "shouldn't be in the game"
    const flaggableWords = Array.from(
        new Set([puzzle.start, puzzle.target]),
    );

    function submitMove() {
        const guess = input.trim().toUpperCase();

        if (!guess) return;

        const validNeighbors = puzzle.neighborGraph[currentWord] ?? [];

        if (!validNeighbors.includes(guess)) {
            setMessage('Invalid move.');
            return;
        }

        const nextMoves = [...moves, guess];

        setMoves(nextMoves);
        setInput('');

        if (guess === puzzle.target) {
            setMessage(`Solved in ${nextMoves.length - 1} moves!`);
        } else {
            setMessage('');
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') submitMove();
    }

    // --- Quality feedback ---

    function handleFeedback(rating: FeedbackRating) {
        setFeedback({ stage: 'asking', rating });
    }

    async function handleReason(reason: string) {
        if (feedback.stage !== 'asking') return;

        await submitFeedback({
            start: puzzle.start,
            target: puzzle.target,
            optimalPathLength: puzzle.optimalPath.length - 1,
            movesTaken: moves.length - 1,
            solved,
            rating: feedback.rating,
            reason,
            timestamp: new Date().toISOString(),
        });

        setFeedback({ stage: 'submitted' });
    }

    // --- Word reports ---

    async function handleMissingWordSubmit() {
        if (wordReport.stage !== 'missing') return;

        const word = wordReport.input.trim().toUpperCase();

        if (!word) return;

        await submitWordReport({
            word,
            kind: 'missing',
            start: puzzle.start,
            target: puzzle.target,
            timestamp: new Date().toISOString(),
        });

        setWordReport({ stage: 'submitted' });
    }

    async function handleBadWordSelect(word: string) {
        await submitWordReport({
            word,
            kind: 'bad',
            start: puzzle.start,
            target: puzzle.target,
            timestamp: new Date().toISOString(),
        });

        setWordReport({ stage: 'submitted' });
    }

    function handleWordReportKeyDown(
        e: React.KeyboardEvent<HTMLInputElement>,
    ) {
        if (e.key === 'Enter') handleMissingWordSubmit();
    }

    // ---

    function generateAnother() {
        router.refresh();
    }

    const reasons =
        feedback.stage === 'asking'
            ? feedback.rating === 'good'
                ? GOOD_REASONS
                : BAD_REASONS
            : [];

    return (
        <main className="w-full max-w-xl mx-auto min-h-screen p-8 flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-4xl font-bold">Ladder</h1>
                <ThemeToggle />
            </div>

            <div className="text-xl">
                {puzzle.start} → {puzzle.target}
            </div>

            <div className="text-sm opacity-60">
                Optimal: {puzzle.optimalPath.length - 1} moves
            </div>

            <div className="flex flex-col gap-2">
                {moves.map((move, index) => (
                    <div
                        key={index}
                        className="border rounded px-4 py-2 text-lg font-mono">
                        {move}
                    </div>
                ))}
            </div>

            {!solved && (
                <div className="flex gap-2">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="border rounded px-3 py-2 flex-1 bg-transparent font-mono uppercase"
                        placeholder="Next word"
                        maxLength={puzzle.start.length}
                        autoFocus
                    />

                    <button
                        onClick={submitMove}
                        className="border rounded px-4 py-2">
                        Submit
                    </button>
                </div>
            )}

            {message && <div className="text-sm opacity-80">{message}</div>}

            {/* ── Quality feedback ── */}
            <div className="border-t pt-4 flex flex-col gap-3">
                {feedback.stage === 'idle' && (
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={() => handleFeedback('good')}
                            className="border rounded px-3 py-1.5 text-sm">
                            👍 Good puzzle
                        </button>

                        <button
                            onClick={() => handleFeedback('bad')}
                            className="border rounded px-3 py-1.5 text-sm">
                            👎 Bad puzzle
                        </button>

                        <button
                            onClick={generateAnother}
                            className="border rounded px-3 py-1.5 text-sm">
                            ↻ New puzzle
                        </button>
                    </div>
                )}

                {feedback.stage === 'asking' && (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm opacity-70">
                            {feedback.rating === 'good'
                                ? 'What made it good?'
                                : 'What made it bad?'}
                        </p>

                        <div className="flex gap-2 flex-wrap">
                            {reasons.map((reason) => (
                                <button
                                    key={reason}
                                    onClick={() => handleReason(reason)}
                                    className="border rounded px-3 py-1.5 text-sm">
                                    {reason}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {feedback.stage === 'submitted' && (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm opacity-70">
                            Thanks for the feedback!
                        </p>

                        <button
                            onClick={generateAnother}
                            className="border rounded px-3 py-1.5 text-sm w-fit">
                            ↻ New puzzle
                        </button>
                    </div>
                )}
            </div>

            {/* ── Word reports ── */}
            <div className="border-t pt-4 flex flex-col gap-3">
                {wordReport.stage === 'idle' && (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs opacity-50 uppercase tracking-wide">
                            Dictionary feedback
                        </p>

                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() =>
                                    setWordReport({
                                        stage: 'missing',
                                        input: '',
                                    })
                                }
                                className="border rounded px-3 py-1.5 text-sm">
                                + Word missing from game
                            </button>

                            <button
                                onClick={() =>
                                    setWordReport({
                                        stage: 'bad',
                                        selected: null,
                                    })
                                }
                                className="border rounded px-3 py-1.5 text-sm">
                                − Word shouldn&apos;t be in game
                            </button>
                        </div>
                    </div>
                )}

                {wordReport.stage === 'missing' && (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm opacity-70">
                            What word did you expect to work?
                        </p>

                        <div className="flex gap-2">
                            <input
                                autoFocus
                                value={wordReport.input}
                                onChange={(e) =>
                                    setWordReport({
                                        stage: 'missing',
                                        input: e.target.value,
                                    })
                                }
                                onKeyDown={handleWordReportKeyDown}
                                className="border rounded px-3 py-2 flex-1 bg-transparent font-mono uppercase"
                                placeholder="WORD"
                                maxLength={puzzle.start.length}
                            />

                            <button
                                onClick={handleMissingWordSubmit}
                                className="border rounded px-4 py-2 text-sm">
                                Submit
                            </button>
                        </div>
                    </div>
                )}

                {wordReport.stage === 'bad' && (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm opacity-70">
                            Which word felt wrong?
                        </p>

                        <div className="flex gap-2 flex-wrap">
                            {flaggableWords.map((word) => (
                                <button
                                    key={word}
                                    onClick={() => handleBadWordSelect(word)}
                                    className="border rounded px-3 py-1.5 text-sm font-mono">
                                    {word}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {wordReport.stage === 'submitted' && (
                    <p className="text-sm opacity-70">
                        Thanks — noted for the dictionary.
                    </p>
                )}
            </div>
        </main>
    );
}
