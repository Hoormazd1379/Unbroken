// ═══════════════════════════════════════════════════════════
// Unbroken — Save System (localStorage)
// ═══════════════════════════════════════════════════════════

import { CONFIG } from './config.js';

const DEFAULT_SAVE = {
    version: CONFIG.SAVE_VERSION,
    highestUnlocked: 1,
    solved: {},           // { "1": { time: ms, moves: n, stars: 1-3 }, ... }
    settings: {
        highContrast: false,
        showTimer: true,
        freePlay: false,
    },
    currentLevel: 1,
};

let saveData = null;

/** Load save from localStorage, or create default */
export function loadSave() {
    try {
        const raw = localStorage.getItem(CONFIG.SAVE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            // Version migration
            if (parsed.version === CONFIG.SAVE_VERSION) {
                saveData = { ...DEFAULT_SAVE, ...parsed };
            } else {
                // Future: migration logic
                saveData = { ...DEFAULT_SAVE };
            }
        } else {
            saveData = { ...DEFAULT_SAVE };
        }
    } catch (e) {
        console.warn('Failed to load save, using defaults:', e);
        saveData = { ...DEFAULT_SAVE };
    }
    return saveData;
}

/** Persist current save to localStorage */
export function persistSave() {
    if (!saveData) return;
    try {
        localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(saveData));
    } catch (e) {
        console.warn('Failed to save progress:', e);
    }
}

/** Get the full save data object */
export function getSave() {
    if (!saveData) loadSave();
    return saveData;
}

/** Mark a level as solved */
export function markSolved(level, time, moves, stars) {
    if (!saveData) loadSave();

    const key = String(level);
    const existing = saveData.solved[key];

    // Only update if better (more stars, or same stars but faster)
    if (!existing || stars > existing.stars ||
        (stars === existing.stars && time < existing.time)) {
        saveData.solved[key] = { time, moves, stars };
    }

    // Unlock next level
    if (level >= saveData.highestUnlocked) {
        saveData.highestUnlocked = level + 1;
    }

    saveData.currentLevel = level + 1;
    persistSave();
}

/** Check if a level is solved */
export function isSolved(level) {
    if (!saveData) loadSave();
    return !!saveData.solved[String(level)];
}

/** Get solved data for a level, or null */
export function getSolvedData(level) {
    if (!saveData) loadSave();
    return saveData.solved[String(level)] || null;
}

/** Get highest unlocked level */
export function getHighestUnlocked() {
    if (!saveData) loadSave();
    return saveData.highestUnlocked;
}

/** Get current level (for continue button) */
export function getCurrentLevel() {
    if (!saveData) loadSave();
    return saveData.currentLevel;
}

/** Set current level */
export function setCurrentLevel(level) {
    if (!saveData) loadSave();
    saveData.currentLevel = level;
    persistSave();
}

/** Get settings */
export function getSettings() {
    if (!saveData) loadSave();
    return saveData.settings;
}

/** Update a setting */
export function updateSetting(key, value) {
    if (!saveData) loadSave();
    saveData.settings[key] = value;
    persistSave();
}

/** Get total stars earned */
export function getTotalStars() {
    if (!saveData) loadSave();
    let total = 0;
    for (const key in saveData.solved) {
        total += saveData.solved[key].stars || 0;
    }
    return total;
}

/** Get total solved count */
export function getSolvedCount() {
    if (!saveData) loadSave();
    return Object.keys(saveData.solved).length;
}

/** Reset all save data */
export function resetSave() {
    saveData = { ...DEFAULT_SAVE };
    persistSave();
}
