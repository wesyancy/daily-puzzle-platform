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

type WordReportStage = 'idle' | 'missing' | 'bad';

const GOOD_REASONS = [
    'Great words',
    'Right difficulty',
    'Satisfying path',
    'Felt clever',
];

const BAD_REASONS = ['Too easy', 'Too hard', 'Obscure words', 'Felt random'];

const STORAGE_KEY = 'ladder-puzzle-state';

type SavedState = {
    puzzle: Puzzle;
    moves: string[];
    hintsUsed: number;
};

export default function GameClient({
    initialPuzzle,
}: {
    initialPuzzle: Puzzle;
}) {
    const router = useRouter();

    const [puzzle, setPuzzle] = useState<Puzzle>(initialPuzzle);
    const [moves, setMoves] = useState<string[]>([initialPuzzle.start]);
    const [input, setInput] = useState('');
    const [message, setMessage] = useState('');

    // Hydration flag — prevents saving before restoration completes
    const [hydrated, setHydrated] = useState(false);

    // Feedback state machine
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

    // Post-puzzle feedback modal — slides up from bottom on mobile
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [feedbackModalContext, setFeedbackModalContext] = useState<
        'solved' | 'abandoned'
    >('abandoned');
    const feedbackModalFired = useRef(false);

    // Solve animation — triggers once when puzzle is first solved
    const [solvedAnimating, setSolvedAnimating] = useState(false);
    const solvedAnimationFired = useRef(false);

    // Restore saved state on mount
    useEffect(() => {
        if (!localStorage.getItem('ladder-seen-instructions')) {
            setShowInstructions(true);
        }

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw) as SavedState;
                if (
                    saved?.puzzle?.start &&
                    saved?.puzzle?.target &&
                    saved?.puzzle?.neighborGraph &&
                    Array.isArray(saved.moves) &&
                    saved.moves.length > 0
                ) {
                    setPuzzle(saved.puzzle);
                    setMoves(saved.moves);
                    setHintsUsed(saved.hintsUsed ?? 0);
                    if (saved.moves[saved.moves.length - 1] === saved.puzzle.target) {
                        // Already solved — skip animation and modal on restore
                        solvedAnimationFired.current = true;
                        feedbackModalFired.current = true;
                    }
                }
            }
        } catch {}

        setHydrated(true);
    }, []);

    // Save puzzle state on every move, after hydration
    useEffect(() => {
        if (!hydrated) return;
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ puzzle, moves, hintsUsed } satisfies SavedState),
            );
        } catch {}
    }, [hydrated, puzzle, moves, hintsUsed]);

    function closeInstructions() {
        localStorage.setItem('ladder-seen-instructions', '1');
        setShowInstructions(false);
    }

    const currentWord = moves[moves.length - 1];
    const solved = currentWord === puzzle.target;
    const validNextWords = [
        ...(puzzle.neighborGraph[currentWord] ?? []),
    ].sort();

    // Trigger solve animation, then open feedback modal
    useEffect(() => {
        if (solved && !solvedAnimationFired.current) {
            solvedAnimationFired.current = true;
            setSolvedAnimating(true);
            setTimeout(() => {
                setSolvedAnimating(false);
                if (!feedbackModalFired.current) {
                    feedbackModalFired.current = true;
                    setFeedbackModalContext('solved');
                    setShowFeedbackModal(true);
                }
            }, 900);
        }
    }, [solved]);

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
                setMessage(
                    `One-letter rule: that changes ${diff === Infinity ? 'the wrong number of' : diff} letters.`,
                );
            } else {
                setMessage('Not in the word list.');
            }
            return;
        }

        const nextMoves = [...moves, guess];
        setMoves(nextMoves);
        setInput('');
        setShowHints(false);

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
        setShowFeedbackModal(false);
        generateAnother();
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

    async function handleBadWordSubmit() {
        const word = wordReportInput.trim().toUpperCase();
        if (!word) return;
        await submitWordReport({
            word,
            kind: 'bad',
            start: puzzle.start,
            target: puzzle.target,
            timestamp: new Date().toISOString(),
        });
        setWordReportInput('');
        setWordReportStage('idle');
        showToast(`"${word}" flagged — thanks!`);
    }

    function handleWordReportKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') handleMissingWordSubmit();
        if (e.key === 'Escape') setWordReportStage('idle');
    }

    function generateAnother() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {}
        router.refresh();
    }

    // Show modal if feedback not yet given, otherwise go straight to new puzzle
    function handleNewPuzzle() {
        if (feedback.stage === 'submitted') {
            generateAnother();
        } else {
            setFeedbackModalContext('abandoned');
            setShowFeedbackModal(true);
        }
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
                            Get from the start word to the target word — one
                            letter at a time.
                        </p>

                        <div className="flex flex-col gap-1">
                            <p className="text-sm font-semibold">
                                The one-letter rule
                            </p>
                            <p className="text-sm opacity-70">
                                Every move, change exactly one letter. The
                                result must be a real word. That&apos;s it.
                            </p>
                        </div>

                        <div className="flex flex-col gap-1 p-3 rounded-md border font-mono text-sm">
                            <span className="opacity-40 text-xs mb-1">
                                COLD → WARM
                            </span>
                            <span>COLD</span>
                            <span className="opacity-40 text-xs">
                                change L→R
                            </span>
                            <span>CORD</span>
                            <span className="opacity-40 text-xs">
                                change C→W
                            </span>
                            <span>WORD</span>
                            <span className="opacity-40 text-xs">
                                change O→A
                            </span>
                            <span>WARD</span>
                            <span className="opacity-40 text-xs">
                                change D→M
                            </span>
                            <span>WARM ✓</span>
                        </div>

                        <p className="text-sm opacity-70">
                            Fewer moves is better — try to match the optimal
                            path.
                        </p>

                        <button
                            onClick={closeInstructions}
                            className="border rounded px-4 py-2 text-sm font-semibold w-full">
                            Let&apos;s play →
                        </button>
                    </div>
                </div>
            )}

            {/* ── Post-puzzle feedback modal ──
                Desktop: centered dialog. Mobile: bottom sheet.
                No close/backdrop — user must rate or skip to proceed. */}
            {showFeedbackModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
                    <div className="bg-[var(--background)] border border-b-0 sm:border rounded-t-2xl sm:rounded-lg p-6 pb-10 sm:pb-6 w-full sm:max-w-sm sm:mx-4 flex flex-col gap-5">
                        {feedback.stage !== 'asking' ? (
                            <>
                                {/* Rating screen */}
                                <div>
                                    <h2 className="text-lg font-bold">
                                        {feedbackModalContext === 'solved'
                                            ? 'Nice work!'
                                            : 'Before you go —'}
                                    </h2>
                                    <p className="text-sm opacity-60 mt-1">
                                        {feedbackModalContext === 'solved'
                                            ? `Solved in ${moves.length - 1} move${moves.length - 1 !== 1 ? 's' : ''}. How was this puzzle?`
                                            : 'How was this puzzle so far?'}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={() => handleFeedback('good')}
                                        className="border-2 border-green-500 rounded-xl px-4 py-4 text-sm font-semibold w-full text-left flex items-center gap-3 active:opacity-70">
                                        <span className="text-2xl">👍</span>
                                        <span>Good puzzle</span>
                                    </button>
                                    <button
                                        onClick={() => handleFeedback('bad')}
                                        className="border-2 border-red-500 rounded-xl px-4 py-4 text-sm font-semibold w-full text-left flex items-center gap-3 active:opacity-70">
                                        <span className="text-2xl">👎</span>
                                        <span>Bad puzzle</span>
                                    </button>
                                </div>

                                <button
                                    onClick={generateAnother}
                                    className="text-sm opacity-40 hover:opacity-70 active:opacity-70 transition-opacity text-center w-full py-1">
                                    Skip →
                                </button>
                            </>
                        ) : (
                            <>
                                {/* Reason screen */}
                                <div>
                                    <h2 className="text-lg font-bold">
                                        {feedback.rating === 'good'
                                            ? 'What made it good?'
                                            : 'What made it bad?'}
                                    </h2>
                                    <p className="text-sm opacity-60 mt-1">
                                        Pick one — it helps us improve.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {reasons.map((reason) => (
                                        <button
                                            key={reason}
                                            onClick={() => handleReason(reason)}
                                            className="border rounded-xl px-3 py-4 text-sm font-medium active:opacity-70">
                                            {reason}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Hints overlay ── */}
            {showHints && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
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
                        <p className="text-xs opacity-40 tracking-wide">
                            a daily word ladder game
                        </p>
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
                    {moves.map((move, index) => {
                        const isLast = index === moves.length - 1;
                        const isSolvedTile = isLast && solved;
                        return (
                            <div
                                key={index}
                                className={[
                                    'border-2 rounded px-4 py-2 text-lg font-mono',
                                    isSolvedTile
                                        ? 'border-green-500 text-green-600 dark:text-green-400'
                                        : 'border-blue-500',
                                    isSolvedTile && solvedAnimating
                                        ? 'animate-pop'
                                        : '',
                                ].join(' ')}>
                                {move}
                                {isSolvedTile && (
                                    <span className="ml-2 text-base">✓</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Input row — text-base on mobile prevents iOS Safari zoom on focus */}
                {!solved && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="border rounded px-4 py-2 w-full sm:flex-1 sm:min-w-0 bg-transparent font-mono uppercase text-base sm:text-lg"
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
                            onClick={() => {
                                setShowHints((v) => !v);
                                setHintsUsed((n) => Math.min(n + 1, 2));
                            }}
                            disabled={hintsUsed >= 2 && !showHints}
                            className="border rounded px-4 py-2 w-full sm:w-auto sm:shrink-0 text-sm opacity-60 hover:opacity-100 transition-opacity disabled:opacity-25 disabled:cursor-not-allowed">
                            Hint ×{Math.max(0, 2 - hintsUsed)}
                        </button>
                    </div>
                )}

                {message && (
                    <div
                        className={`text-sm opacity-80 ${solved ? 'animate-fade-up font-semibold' : ''}`}>
                        {message}
                    </div>
                )}

                {/* New Puzzle button — triggers feedback modal if not yet rated */}
                <div className="sm:flex sm:justify-center">
                    <button
                        onClick={handleNewPuzzle}
                        className="border-2 border-yellow-400 rounded px-3 py-1.5 text-sm w-full sm:w-64">
                        ↻ New puzzle
                    </button>
                </div>

                {/* ── Dictionary feedback ── */}
                <div className="border-t pt-4 flex flex-col gap-3">
                    <p className="text-xs opacity-50 uppercase tracking-wide">
                        Dictionary feedback
                    </p>

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
                                    className="border rounded px-3 py-2 flex-1 bg-transparent font-mono uppercase text-base"
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
                            <div className="flex gap-2">
                                <input
                                    autoFocus
                                    value={wordReportInput}
                                    onChange={(e) =>
                                        setWordReportInput(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleBadWordSubmit();
                                        if (e.key === 'Escape') {
                                            setWordReportStage('idle');
                                            setWordReportInput('');
                                        }
                                    }}
                                    className="border rounded px-3 py-2 flex-1 bg-transparent font-mono uppercase text-base"
                                    placeholder="WORD"
                                    maxLength={puzzle.start.length}
                                />
                                <button
                                    onClick={handleBadWordSubmit}
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
                </div>
            </main>
        </>
    );
}
