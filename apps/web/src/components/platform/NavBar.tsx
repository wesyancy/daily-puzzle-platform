'use client';

import Link from 'next/link';
import { DropdownMenu } from 'radix-ui';
import { Menu } from 'lucide-react';
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

            {/* Right: desktop links + mobile hamburger + settings */}
            <div className="flex items-center gap-1">
                {/* Desktop-only nav links */}
                <Link
                    href="/leaderboards"
                    className="hidden sm:inline-block text-sm opacity-50 hover:opacity-80 transition-opacity px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
                    Leaderboards
                </Link>
                <Link
                    href="/feedback"
                    className="hidden sm:inline-block text-sm opacity-50 hover:opacity-80 transition-opacity px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
                    Feedback
                </Link>

                {/* Mobile hamburger — hidden on sm+, reveals all nav links */}
                <div className="sm:hidden">
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button
                                className="border rounded p-2 opacity-70 hover:opacity-100 transition-opacity"
                                aria-label="Menu">
                                <Menu className="w-4 h-4" />
                            </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content
                                align="end"
                                sideOffset={8}
                                className="bg-[var(--background)] border rounded-lg py-1 shadow-lg min-w-[10rem] z-50">
                                <DropdownMenu.Item asChild>
                                    <Link
                                        href="/stepladder"
                                        className="block px-4 py-2.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5 outline-none cursor-pointer">
                                        Stepladder
                                    </Link>
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator className="my-1 border-t" />
                                <DropdownMenu.Item asChild>
                                    <Link
                                        href="/leaderboards"
                                        className="block px-4 py-2.5 text-sm opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 outline-none cursor-pointer">
                                        Leaderboards
                                    </Link>
                                </DropdownMenu.Item>
                                <DropdownMenu.Item asChild>
                                    <Link
                                        href="/feedback"
                                        className="block px-4 py-2.5 text-sm opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 outline-none cursor-pointer">
                                        Feedback
                                    </Link>
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                </div>

                <div className="ml-1">
                    <SettingsMenu />
                </div>
            </div>
        </nav>
    );
}
