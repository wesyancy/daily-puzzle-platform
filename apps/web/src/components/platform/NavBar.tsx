import Link from 'next/link';
import { SettingsMenu } from './SettingsMenu';

// Platform-level nav bar — rendered once in root layout, sits above all game content.
// Height is h-12 (3rem); GameClient subtracts this from h-dvh on mobile.
export function NavBar() {
    return (
        <nav className="h-12 flex-none border-b flex items-center px-4 gap-4">
            {/* Left: games list — single entry today, easy to extend */}
            <div className="flex-1 flex items-center gap-1">
                <span className="text-xs uppercase tracking-widest opacity-30 mr-2 hidden sm:inline">Games</span>
                <Link
                    href="/stepladder"
                    className="text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
                    Stepladder
                </Link>
            </div>

            {/* Right: platform links + settings */}
            <div className="flex items-center gap-1">
                <Link
                    href="/leaderboards"
                    className="text-sm opacity-50 hover:opacity-80 transition-opacity px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
                    Leaderboards
                </Link>
                <Link
                    href="/feedback"
                    className="text-sm opacity-50 hover:opacity-80 transition-opacity px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5 hidden sm:inline-block">
                    Feedback
                </Link>
                <div className="ml-1">
                    <SettingsMenu />
                </div>
            </div>
        </nav>
    );
}
