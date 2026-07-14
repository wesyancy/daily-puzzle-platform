'use client';

// QWERTY layout rows; ENTER and ⌫ are wider action keys on row 3.
const ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
] as const;

interface Props {
    // Receives 'A'–'Z', 'ENTER', or 'BACKSPACE'
    onKeyPress: (key: string) => void;
    disabled?: boolean;
}

// Purely presentational — no state, no input ownership.
export function StepladderKeyboard({ onKeyPress, disabled }: Props) {
    return (
        <div className="flex flex-col gap-1.5 w-full select-none" aria-label="On-screen keyboard">
            {ROWS.map((row, rowIdx) => (
                <div key={rowIdx} className="flex justify-center gap-1">
                    {row.map((key) => {
                        const isEnter = key === 'ENTER';
                        const isDelete = key === '⌫';
                        const emittedKey = isDelete ? 'BACKSPACE' : key;

                        // Action keys get colored borders only; background and text match letter keys.
                        const colorClasses = isEnter
                            ? 'bg-gray-200 dark:bg-neutral-600 border-2 border-green-500 hover:bg-gray-300 dark:hover:bg-neutral-500'
                            : isDelete
                            ? 'bg-gray-200 dark:bg-neutral-600 border-2 border-red-500 hover:bg-gray-300 dark:hover:bg-neutral-500'
                            : 'bg-gray-200 dark:bg-neutral-600 border border-black/10 dark:border-white/10 hover:bg-gray-300 dark:hover:bg-neutral-500';

                        return (
                            <button
                                key={key}
                                onClick={() => onKeyPress(emittedKey)}
                                disabled={disabled}
                                // flex-[1.5] makes action keys 50% wider than letter keys
                                className={[
                                    'h-12 rounded font-semibold text-sm uppercase',
                                    'transition-colors active:scale-95',
                                    'disabled:opacity-30 disabled:cursor-not-allowed',
                                    (isEnter || isDelete) ? 'flex-[1.5] text-xs px-1' : 'flex-1',
                                    colorClasses,
                                ].join(' ')}
                                aria-label={isDelete ? 'Backspace' : key}>
                                {key}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
