'use client';

import { DropdownMenu } from 'radix-ui';
import { Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

// Settings dropdown in the platform nav — currently holds just the theme toggle.
// Add new platform-wide settings here as they're introduced.
export function SettingsMenu() {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    className="border rounded p-2 opacity-70 hover:opacity-100 transition-opacity"
                    aria-label="Settings">
                    <Settings className="w-4 h-4" />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="end"
                    sideOffset={8}
                    className="bg-[var(--background)] border rounded-lg p-3 shadow-lg flex flex-col gap-2 min-w-[10rem] z-50">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-sm opacity-70">Theme</span>
                        <ThemeToggle />
                    </div>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
