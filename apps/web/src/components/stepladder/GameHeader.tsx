// Game Header — title block and How to Play button.
// Shared between the active puzzle screen and the summary screen.
export function GameHeader({ onHowToPlay }: { onHowToPlay: () => void }) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
                <h1 className="text-4xl font-bold">Stepladder</h1>
                <p className="text-xs opacity-40 tracking-wide">a daily word ladder game</p>
            </div>
            <button
                onClick={onHowToPlay}
                className="border rounded px-2.5 py-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity"
                title="How to play">
                How to Play
            </button>
        </div>
    );
}
