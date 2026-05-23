export function calculateLetterSimilarity(a: string, b: string): number {
    let matches = 0;

    for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) {
            matches++;
        }
    }

    return matches;
}
