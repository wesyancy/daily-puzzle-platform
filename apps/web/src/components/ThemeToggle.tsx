'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();

    // next-themes doesn't know the theme until after hydration.
    // Render a same-size placeholder first to prevent layout shift.
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return <div className="w-9 h-9" />;
    }

    const isDark = resolvedTheme === 'dark';

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="border rounded p-2 opacity-70 hover:opacity-100 transition-opacity"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {isDark ? (
                <Sun className="w-4 h-4" />
            ) : (
                <Moon className="w-4 h-4" />
            )}
        </button>
    );
}
