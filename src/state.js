// ═══════════════════════════════════════════════════════════
// Unbroken — Game State Machine
// ═══════════════════════════════════════════════════════════

export const SCREENS = {
    TITLE: 'title',
    MENU: 'menu',
    LEVEL_SELECT: 'level_select',
    PLAYING: 'playing',
    WIN: 'win',
    SETTINGS: 'settings',
};

let currentScreen = SCREENS.TITLE;
let previousScreen = SCREENS.TITLE;
let transitioning = false;
let transitionCallback = null;

const listeners = new Set();

/** Get current screen */
export function getScreen() {
    return currentScreen;
}

/** Get previous screen */
export function getPreviousScreen() {
    return previousScreen;
}

/** Switch to a new screen */
export function setScreen(screen, callback) {
    if (transitioning) return;

    previousScreen = currentScreen;
    currentScreen = screen;

    // Notify listeners
    for (const fn of listeners) {
        fn(screen, previousScreen);
    }

    if (callback) callback();
}

/** Register a screen change listener */
export function onScreenChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Check if currently on a given screen */
export function isScreen(screen) {
    return currentScreen === screen;
}
