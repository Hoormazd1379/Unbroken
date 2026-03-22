// ═══════════════════════════════════════════════════════════
// Unbroken — Seeded PRNG Utilities
// ═══════════════════════════════════════════════════════════

/**
 * Hash a level number into a 32-bit seed.
 * Uses a simple but effective integer hash (splitmix-style).
 */
export function hashLevel(level) {
    let h = (level * 2654435761) >>> 0;
    h = ((h >>> 16) ^ h) * 0x45d9f3b;
    h = ((h >>> 16) ^ h) * 0x45d9f3b;
    h = (h >>> 16) ^ h;
    return h >>> 0;
}

/**
 * Mulberry32 — a fast, high-quality 32-bit PRNG.
 * Returns a PRNG instance with utility methods.
 */
export function createRNG(seed) {
    let state = seed >>> 0;

    function next() {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    return {
        /** Returns float in [0, 1) */
        nextFloat() {
            return next();
        },

        /** Returns integer in [min, max] inclusive */
        nextInt(min, max) {
            return min + Math.floor(next() * (max - min + 1));
        },

        /** Returns boolean with given probability (default 0.5) */
        nextBool(p = 0.5) {
            return next() < p;
        },

        /** Pick a random element from array */
        pick(arr) {
            return arr[Math.floor(next() * arr.length)];
        },

        /** Shuffle array in place (Fisher-Yates) */
        shuffle(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        },

        /** Weighted random pick: items is [{value, weight}, ...] */
        weightedPick(items) {
            const total = items.reduce((s, it) => s + it.weight, 0);
            let r = next() * total;
            for (const item of items) {
                r -= item.weight;
                if (r <= 0) return item.value;
            }
            return items[items.length - 1].value;
        },
    };
}
