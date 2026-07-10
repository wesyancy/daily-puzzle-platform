import { defineConfig } from 'vitest/config';

// Pure Node environment — game-engine has no DOM dependencies.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
