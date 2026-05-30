'use client';

import { useState, useEffect, useRef } from 'react';
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

// WordReport no longer has a terminal 'submitted' stage — after submitting
// we show a brief toast and return to idle so multiple reports are possible.
type WordReportStage = 'idle' | 'missing' | 'bad';

const GOOD_REASONS = [
    'Great words',
    'Right difficulty',
    'Satisfying path',
    'Felt clever',
];

const BAD_REASONS = ['Too easy', 'Too hard', 'Obscure words', 'Felt random'];

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

    // Feedback state
    const [feedback, setFeedback] = useState<FeedbackState>({ stage: 'idle' });

    // Word report state
    const [wordReportStage, setWordReportStage] =
        useState<WordReportStage>('idle');
    const [wordReportInput, setWordReportInput] = useState('');
    const [wordReportToast, setWordReportToast] = useState('');
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Hints popup
    const [showHints, setShowHints] = useState(false);
    const [hintsUsed, setHintsUsed] = useState(0);

    // How to play modal — auto-opens on first visit
    const [showInstructions, setShowInstructions] = useState(false);

    // Feedback reminder modal — triggers after first word submission
    const [showFeedbackReminder, setShowFeedbackReminder] = useState(false);
    const feedbackReminderShown = useRef(false);

    useEffect(() => {
        if (!localStorage.getItem('ladder-seen-instructions')) {
            setShowInstructions(true);
        }
    }, []);

    function closeInstructions() {
        localStorage.setItem('ladder-seen-instructions', '1');
        setShowInstructions(false);
    }

    const currentWord = moves[moves.length - 1];
    const solved = currentWord === puzzle.target;
    const validNextWords = [
        ...(puzzle.neighborGraph[currentWord] ?? []),
    ].sort();
    const flaggableWords = Array.from(new Set([puzzle.start, puzzle.target]));

    // Clean up toast timer on unmount
    useEffect(() => {
        return () => {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        };
    }, []);

    function showToast(msg: string) {
        setWordReportToast(msg);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setWordReportToast(''), 2500);
    }

    // ── Gameplay ──────────────────────────────────────────────────────────────

    function letterDiff(a: string, b: string): number {
        if (a.length !== b.length) return Infinity;
        let diffs = 0;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++;
        return diffs;
    }

    function submitMove(word?: string) {
        const guess = (word ?? input).trim().toUpperCase();
        if (!guess) return;

        const validNeighbors = puzzle.neighborGraph[currentWord] ?? [];
        if (!validNeighbors.includes(guess)) {
            const diff = letterDiff(currentWord, guess);
            if (diff === 0) {
                setMessage("That's the word you're already on.");
            } else if (diff !== 1) {
                setMessage(`One-letter rule: that changes ${diff === Infinity ? 'the wrong number of' : diff} letters.`);
            } else {
                setMessage("Not in the word list.");
            }
            return;
        }

        const nextMoves = [...moves, guess];
        setMoves(nextMoves);
        setInput('');
        setShowHints(false);

        if (!feedbackReminderShown.current) {
            feedbackReminderShown.current = true;
            setShowFeedbackReminder(true);
        }

        if (guess === puzzle.target) {
            setMessage(`Solved in ${nextMoves.length - 1} moves!`);
        } else {
            setMessage('');
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') submitMove();
    }

    function pickHint(word: string) {
        setInput(word);
        setShowHints(false);
    }

    // ── Quality feedback ──────────────────────────────────────────────────────

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

    // ── Word reports ──────────────────────────────────────────────────────────

    async function handleMissingWordSubmit() {
        const word = wordReportInput.trim().toUpperCase();
        if (!word) return;
        await submitWordReport({
            word,
            kind: 'missing',
            start: puzzle.start,
            target: puzzle.target,
            timestamp: new Date().toISOString(),
        });
        setWordReportInput('');
        setWordReportStage('idle');
        showToast(`"${word}" submitted — thanks!`);
    }

    async function handleBadWordSelect(word: string) {
        await submitWordReport({
            word,
            kind: 'bad',
            start: puzzle.start,
            target: puzzle.target,
            timestamp: new Date().toISOString(),
        });
        setWordReportStage('idle');
        showToast(`"${word}" flagged — thanks!`);
    }

    function handleWordReportKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') handleMissingWordSubmit();
        if (e.key === 'Escape') setWordReportStage('idle');
    }

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
        <>
            {/* ── How to play modal ── */}
            {showInstructions && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                    onClick={closeInstructions}>
                    <div
                        className="bg-[var(--background)] border rounded-lg p-6 max-w-sm w-full mx-4 flex flex-col gap-5"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">How to Play</h2>
                            <button
                                onClick={closeInstructions}
                                className="opacity-50 hover:opacity-100 text-lg leading-none px-1">
                                ✕
                            </button>
                        </div>

                        <p className="text-sm opacity-70">
                            Get from the start word to the target word — one letter at a time.
                        </p>

                        <div className="flex flex-col gap-1">
                            <p className="text-sm font-semibold">The one-letter rule</p>
                            <p className="text-sm opacity-70">
                                Every move, change exactly one letter. The result must be a real word. That&apos;s it.
                            </p>
                        </div>

                        <div className="flex flex-col gap-1 p-3 rounded-md border font-mono text-sm">
                            <span className="opacity-40 text-xs mb-1">COLD → WARM</span>
                            <span>COLD</span>
                            <span className="opacity-40 text-xs">change L→R</span>
                            <span>CORD</span>
                            <span className="opacity-40 text-xs">change C→W</span>
                            <span>WORD</span>
                            <span className="opacity-40 text-xs">change O→A</span>
                            <span>WARD</span>
                            <span className="opacity-40 text-xs">change D→M</span>
                            <span>WARM ✓</span>
                        </div>

                        <p className="text-sm opacity-70">
                            Fewer moves is better — try to match the optimal path.
                        </p>

                        <button
                            onClick={closeInstructions}
                            className="border rounded px-4 py-2 text-sm font-semibold w-full">
                            Let&apos;s play →
                        </button>
                    </div>
                </div>
            )}

            {/* ── Feedback reminder modal ── */}
            {showFeedbackReminder && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                    onClick={() => setShowFeedbackReminder(false)}>
                    <div
                        className="bg-[var(--background)] border rounded-lg p-6 max-w-sm w-full mx-4 flex flex-col gap-4"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">Every puzzle counts</h2>
                            <button
                                onClick={() => setShowFeedbackReminder(false)}
                                className="opacity-50 hover:opacity-100 text-lg leading-none px-1">
                                ✕
                            </button>
                        </div>

                        <ul className="text-sm opacity-70 flex flex-col gap-2">
                            <li>👍 👎 &nbsp;Rate the puzzle — good or bad</li>
                            <li>🔤 &nbsp;Flag missing or wrong words</li>
                            <li>↻ &nbsp;Skip if it&apos;s not working for you</li>
                        </ul>

                        <p className="text-xs opacity-40">Your feedback shapes the game. Do it for every puzzle.</p>

                        <button
                            onClick={() => setShowFeedbackReminder(false)}
                            className="border rounded px-4 py-2 text-sm font-semibold w-full">
                            Got it
                        </button>
                    </div>
                </div>
            )}

            {/* ── Hints overlay ── */}
            {showHints && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                    onClick={() => setShowHints(false)}>
                    <div
                        className="bg-[var(--background)] border rounded-lg p-6 max-w-sm w-full mx-4 flex flex-col gap-4"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-0.5">
                                <p className="font-semibold">
                                    Valid moves from{' '}
                                    <span className="font-mono">
                                        {currentWord}
                                    </span>
                                </p>
                                <p className="text-xs opacity-40 uppercase tracking-wide">
                                    Alpha — research only
                                </p>
                            </div>
                            <button
                                onClick={() => setShowHints(false)}
                                className="opacity-50 hover:opacity-100 text-lg leading-none px-1">
                                ✕
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {validNextWords.map((word) => (
                                <button
                                    key={word}
                                    onClick={() => pickHint(word)}
                                    className="border rounded px-3 py-1.5 text-sm font-mono hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                                    {word}
                                </button>
                            ))}
                        </div>

                        <p className="text-xs opacity-40">
                            Tap a word to fill the input, then Submit to play
                            it.
                        </p>
                    </div>
                </div>
            )}

            <main className="w-full max-w-xl mx-auto min-h-screen px-4 py-6 sm:p-8 flex flex-col gap-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                        <h1 className="text-4xl font-bold">Steple</h1>
                        <p className="text-xs opacity-40 tracking-wide">a daily word ladder game</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowInstructions(true)}
                            className="border rounded px-2.5 py-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity"
                            title="How to play">
                            How to Play
                        </button>
                        <ThemeToggle />
                    </div>
                </div>

                <div className="flex items-center justify-center gap-6">
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xs uppercase tracking-widest opacity-40">
                            Start
                        </span>
                        <span className="text-xl font-mono font-semibold">
                            {puzzle.start}
                        </span>
                    </div>
                    <span className="text-lg opacity-30">→</span>
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xs uppercase tracking-widest opacity-40">
                            Target
                        </span>
                        <span className="text-xl font-mono font-semibold">
                            {puzzle.target}
                        </span>
                    </div>
                </div>

                <div className="text-sm opacity-60 text-center">
                    Shortest path: {puzzle.optimalPath.length - 1} moves
                </div>

                {/* Move chain */}
                <div className="flex flex-col gap-2">
                    {moves.map((move, index) => (
                        <div
                            key={index}
                            className="border-2 border-blue-500 rounded px-4 py-2 text-lg font-mono">
                            {move}
                        </div>
                    ))}
                </div>

                {/* Input row */}
                {!solved && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="border rounded px-4 py-2 w-full sm:flex-1 sm:min-w-0 bg-transparent font-mono uppercase text-lg"
                            placeholder="Next word"
                            maxLength={puzzle.start.length}
                            autoFocus
                        />
                        <button
                            onClick={() => submitMove()}
                            className="border rounded px-4 py-2 w-full sm:w-auto sm:shrink-0">
                            Submit
                        </button>
                        <button
                            onClick={() => { setShowHints((v) => !v); setHintsUsed((n) => Math.min(n + 1, 2)); }}
                            disabled={hintsUsed >= 2 && !showHints}
                            className="border rounded px-4 py-2 w-full sm:w-auto sm:shrink-0 text-sm opacity-60 hover:opacity-100 transition-opacity disabled:opacity-25 disabled:cursor-not-allowed">
                            Hint ×{Math.max(0, 2 - hintsUsed)}
                        </button>
                    </div>
                )}

                {message && <div className="text-sm opacity-80">{message}</div>}

                {/* ── Quality feedback ── */}
                <div className="border-t pt-4 flex flex-col gap-3">
                    <p className="text-xs opacity-50 uppercase tracking-wide">
                        Puzzle feedback
                    </p>
                    {feedback.stage === 'idle' && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                onClick={() => handleFeedback('good')}
                                className="border-2 border-green-500 rounded px-3 py-1.5 text-sm w-full sm:flex-1">
                                👍 Good puzzle
                            </button>
                            <button
                                onClick={() => handleFeedback('bad')}
                                className="border-2 border-red-500 rounded px-3 py-1.5 text-sm w-full sm:flex-1">
                                👎 Bad puzzle
                            </button>
                            <button
                                onClick={generateAnother}
                                className="border-2 border-yellow-400 rounded px-3 py-1.5 text-sm w-full sm:flex-1">
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
                                className="border-2 border-yellow-400 rounded px-3 py-1.5 text-sm w-full sm:w-fit">
                                ↻ New puzzle
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Dictionary feedback ── */}
                <div className="border-t pt-4 flex flex-col gap-3">
                    <p className="text-xs opacity-50 uppercase tracking-wide">
                        Dictionary feedback
                    </p>

                    {/* Toast confirmation */}
                    {wordReportToast && (
                        <p className="text-sm opacity-70">{wordReportToast}</p>
                    )}

                    {wordReportStage === 'idle' && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                onClick={() => setWordReportStage('missing')}
                                className="border rounded px-3 py-1.5 text-sm w-full sm:flex-1">
                                + submit a missing word +
                            </button>
                            <button
                                onClick={() => setWordReportStage('bad')}
                                className="border rounded px-3 py-1.5 text-sm w-full sm:flex-1">
                                − help remove a word −
                            </button>
                        </div>
                    )}

                    {wordReportStage === 'missing' && (
                        <div className="flex flex-col gap-2">
                            <p className="text-sm opacity-70">
                                What word did you expect to work?
                            </p>
                            <div className="flex gap-2">
                                <input
                                    autoFocus
                                    value={wordReportInput}
                                    onChange={(e) =>
                                        setWordReportInput(e.target.value)
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
                                <button
                                    onClick={() => {
                                        setWordReportStage('idle');
                                        setWordReportInput('');
                                    }}
                                    className="border rounded px-3 py-2 text-sm opacity-50 hover:opacity-100">
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}

                    {wordReportStage === 'bad' && (
                        <div className="flex flex-col gap-2">
                            <p className="text-sm opacity-70">
                                Which word felt wrong?
                            </p>
                            <div className="flex gap-2 flex-wrap">
                                {flaggableWords.map((word) => (
                                    <button
                                        key={word}
                                        onClick={() =>
                                            handleBadWordSelect(word)
                                        }
                                        className="border rounded px-3 py-1.5 text-sm font-mono">
                                        {word}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setWordReportStage('idle')}
                                    className="border rounded px-3 py-1.5 text-sm opacity-50 hover:opacity-100">
                                    ✕ Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </>
    );
}
