type WordReportStage = 'idle' | 'missing' | 'bad';

interface Props {
    stage: WordReportStage;
    onStageChange: (stage: WordReportStage) => void;
    input: string;
    onInputChange: (value: string) => void;
    onClose: () => void;
    onSubmitMissing: () => void;
    onSubmitBad: () => void;
    maxLength: number;
}

// Word Report modal — bottom-sheet on mobile, centered dialog on desktop.
export function WordReportModal({
    stage, onStageChange, input, onInputChange, onClose, onSubmitMissing, onSubmitBad, maxLength,
}: Props) {
    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') stage === 'missing' ? onSubmitMissing() : onSubmitBad();
        if (e.key === 'Escape') onClose();
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
            onClick={onClose}>
            <div
                className="bg-[var(--background)] border border-b-0 sm:border rounded-t-2xl sm:rounded-lg p-6 pb-10 sm:pb-6 w-full sm:max-w-sm sm:mx-4 flex flex-col gap-5"
                onClick={(e) => e.stopPropagation()}>
                {stage === 'idle' && (
                    <>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">Report a word</h2>
                            <button onClick={onClose} className="opacity-50 hover:opacity-100 text-lg leading-none px-1">✕</button>
                        </div>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => onStageChange('missing')}
                                className="border rounded-xl px-4 py-4 text-sm font-semibold w-full text-left flex flex-col gap-0.5 active:opacity-70">
                                <span>+ Missing word</span>
                                <span className="font-normal opacity-50">A word that should be in the game</span>
                            </button>
                            <button
                                onClick={() => onStageChange('bad')}
                                className="border rounded-xl px-4 py-4 text-sm font-semibold w-full text-left flex flex-col gap-0.5 active:opacity-70">
                                <span>− Report word</span>
                                <span className="font-normal opacity-50">A word that should not be in the game</span>
                            </button>
                        </div>
                    </>
                )}

                {stage === 'missing' && (
                    <>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">Missing word</h2>
                            <button onClick={onClose} className="opacity-50 hover:opacity-100 text-lg leading-none px-1">✕</button>
                        </div>
                        <p className="text-sm opacity-60">What word did you expect to work?</p>
                        <div className="flex gap-2">
                            <input
                                autoFocus
                                value={input}
                                onChange={(e) => onInputChange(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="border rounded px-3 py-3 flex-1 bg-transparent font-mono uppercase text-base"
                                placeholder="WORD"
                                maxLength={maxLength}
                            />
                            <button onClick={onSubmitMissing} className="border rounded px-4 py-3 text-sm font-semibold">Submit</button>
                        </div>
                        <button onClick={() => onStageChange('idle')} className="text-sm opacity-40 hover:opacity-70 transition-opacity text-center w-full py-1">← Back</button>
                    </>
                )}

                {stage === 'bad' && (
                    <>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">Wrong word</h2>
                            <button onClick={onClose} className="opacity-50 hover:opacity-100 text-lg leading-none px-1">✕</button>
                        </div>
                        <p className="text-sm opacity-60">Which word felt wrong?</p>
                        <div className="flex gap-2">
                            <input
                                autoFocus
                                value={input}
                                onChange={(e) => onInputChange(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="border rounded px-3 py-3 flex-1 bg-transparent font-mono uppercase text-base"
                                placeholder="WORD"
                                maxLength={maxLength}
                            />
                            <button onClick={onSubmitBad} className="border rounded px-4 py-3 text-sm font-semibold">Submit</button>
                        </div>
                        <button onClick={() => onStageChange('idle')} className="text-sm opacity-40 hover:opacity-70 transition-opacity text-center w-full py-1">← Back</button>
                    </>
                )}
            </div>
        </div>
    );
}
