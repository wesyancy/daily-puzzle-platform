import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // outputFileTracingRoot is only needed for production (Vercel) so that
    // Next.js includes monorepo data files (puzzle-words.txt, word-pairs.txt)
    // in the deployment bundle. Turbopack scans the whole repo if this is set
    // in dev, which causes compilation to hang — so we gate it to prod only.
    ...(process.env.NODE_ENV === 'production' && {
        outputFileTracingRoot: path.join(__dirname, '../../'),
    }),
};

export default nextConfig;
