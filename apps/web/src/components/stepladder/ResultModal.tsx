interface Props {
    passed: boolean;
    movesTaken: number;
    shortestPath: number;
    score: number;
    onNext: () => void;
}

// Result modal — shown immediately after each tier resolves, auto-dismissed by parent timer.
export function ResultModal({ passed, movesTaken, shortestPath, score, onNext }: Props) {
    const over = movesTaken - shortestPath;
    const resultLine = passed
        ? over === 0
            ? `${movesTaken} moves — matched the shortest path!`
            : `${movesTaken} moves (shortest path: ${shortestPath}, +${over})`
        : `Shortest path: ${shortestPath} moves`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[var(--background)] border rounded-2xl p-8 w-full max-w-sm mx-4 flex flex-col items-center gap-5">
                <span className={`text-5xl ${passed ? 'text-green-500' : 'text-red-500'}`}>
                    {passed ? '✓' : '✗'}
                </span>
                <div className="text-center flex flex-col gap-1">
                    <p className="text-lg font-bold">{passed ? 'Solved!' : 'Out of moves'}</p>
                    <p className="text-sm opacity-60">{resultLine}</p>
                    {/* Tier score — always shown so players learn the formula */}
                    <p className={`text-2xl font-bold mt-1 ${passed ? 'text-green-500' : 'text-red-400 opacity-60'}`}>
                        {passed ? `+${score} pts` : '0 pts'}
                    </p>
                </div>

                {/* Draining progress bar — animates down to zero over the advance delay */}
                <div className="w-full h-1 bg-black/10 dark:bg-white/10 rounded overflow-hidden">
                    <div className={`h-full rounded ${passed ? 'bg-green-500 animate-drain-pass' : 'bg-red-500 animate-drain-fail'}`} />
                </div>

                <button
                    onClick={onNext}
                    className="text-sm opacity-50 hover:opacity-100 transition-opacity">
                    Next →
                </button>
            </div>
        </div>
    );
}
