// ═══════════════════════════════════════════════════════════
// Unbroken — UI Manager (DOM-based screens)
// ═══════════════════════════════════════════════════════════

import { CONFIG } from './config.js';
import { SCREENS, setScreen, getScreen } from './state.js';
import * as Save from './save.js';

let uiContainer = null;
let hudContainer = null;
let gameCallbacks = {};

/**
 * Initialize the UI system.
 */
export function initUI(container, hud, callbacks) {
    uiContainer = container;
    hudContainer = hud;
    gameCallbacks = callbacks;
}

/**
 * Show the title screen.
 */
export function showTitle() {
    setScreen(SCREENS.TITLE);
    hideHUD();
    uiContainer.innerHTML = `
        <div class="screen title-screen">
            <div class="title-bg-shapes"></div>
            <div class="title-content">
                <h1 class="game-title">${CONFIG.GAME_TITLE}</h1>
                <p class="game-subtitle">${CONFIG.GAME_SUBTITLE}</p>
                <div class="title-buttons">
                    <button class="btn btn-primary" id="btn-play">
                        <span class="btn-icon">▶</span> Play
                    </button>
                    <button class="btn btn-secondary" id="btn-levels">
                        <span class="btn-icon">◫</span> Levels
                    </button>
                    <button class="btn btn-secondary" id="btn-settings">
                        <span class="btn-icon">⚙</span> Settings
                    </button>
                </div>
                <div class="title-stats">
                    <span class="stat">★ ${Save.getTotalStars()}</span>
                    <span class="stat-sep">·</span>
                    <span class="stat">${Save.getSolvedCount()} solved</span>
                </div>
                <p class="mouse-hint">Best played with a mouse</p>
            </div>
        </div>
    `;

    document.getElementById('btn-play').addEventListener('click', () => {
        const level = Save.getCurrentLevel();
        gameCallbacks.startLevel(level);
    });
    document.getElementById('btn-levels').addEventListener('click', () => {
        showLevelSelect();
    });
    document.getElementById('btn-settings').addEventListener('click', () => {
        showSettings();
    });
}

/**
 * Show level select screen.
 */
export function showLevelSelect(page = 0) {
    setScreen(SCREENS.LEVEL_SELECT);
    hideHUD();

    const settings = Save.getSettings();
    const freePlay = settings.freePlay || false;

    const pageSize = CONFIG.LEVEL_SELECT.PAGE_SIZE;
    const highest = Save.getHighestUnlocked();
    const maxLevel = freePlay ? Math.max(highest + pageSize * 2, 120) : highest;
    const totalPages = Math.max(1, Math.ceil(maxLevel / pageSize));
    page = Math.max(0, Math.min(page, totalPages - 1));

    const startLevel = page * pageSize + 1;
    const endLevel = startLevel + pageSize - 1;

    let gridHTML = '';
    for (let lv = startLevel; lv <= endLevel; lv++) {
        const solvedData = Save.getSolvedData(lv);
        const isUnlocked = lv <= highest;
        const isPlayable = isUnlocked || freePlay;
        const status = solvedData ? 'solved' : (isUnlocked ? 'unlocked' : 'locked');

        let starsHTML = '';
        for (let s = 1; s <= 3; s++) {
            starsHTML += `<span class="level-star ${s <= (solvedData?.stars || 0) ? 'earned' : ''}">${s <= (solvedData?.stars || 0) ? '★' : '☆'}</span>`;
        }

        gridHTML += `
            <button class="level-cell ${status} ${freePlay && !isUnlocked ? 'free-play' : ''}" data-level="${lv}" ${!isPlayable ? 'disabled' : ''}>
                <span class="level-num">${lv}</span>
                <div class="level-stars">${starsHTML}</div>
                ${!isUnlocked ? '<span class="level-lock">' + (freePlay ? '🔓' : '🔒') + '</span>' : ''}
            </button>
        `;
    }

    uiContainer.innerHTML = `
        <div class="screen level-select-screen">
            <div class="screen-header">
                <button class="btn btn-back" id="btn-back-title">← Back</button>
                <h2 class="screen-title">Level Select</h2>
                <div class="page-nav">
                    <button class="btn btn-small" id="btn-prev-page" ${page === 0 ? 'disabled' : ''}>‹</button>
                    <span class="page-info">${page + 1} / ${totalPages}</span>
                    <button class="btn btn-small" id="btn-next-page" ${page >= totalPages - 1 ? 'disabled' : ''}>›</button>
                </div>
            </div>
            <div class="level-grid">${gridHTML}</div>
        </div>
    `;

    document.getElementById('btn-back-title').addEventListener('click', () => showTitle());
    document.getElementById('btn-prev-page')?.addEventListener('click', () => showLevelSelect(page - 1));
    document.getElementById('btn-next-page')?.addEventListener('click', () => showLevelSelect(page + 1));

    uiContainer.querySelectorAll('.level-cell:not([disabled])').forEach(cell => {
        cell.addEventListener('click', () => {
            const lv = parseInt(cell.dataset.level);
            gameCallbacks.startLevel(lv);
        });
    });
}

/**
 * Show in-game HUD.
 */
export function showHUD(level, puzzle) {
    setScreen(SCREENS.PLAYING);
    uiContainer.innerHTML = '';

    // Build color indicator dots
    let colorDots = '';
    if (level.colorCount > 1) {
        for (let i = 0; i < level.colorCount; i++) {
            const nc = CONFIG.NODE_COLORS[i];
            colorDots += `<span class="hud-color-dot" style="background:${nc?.hex || '#fff'}"></span>`;
        }
    }

    // Hint counter
    const hintsLeft = puzzle.hintsRemaining;
    const hintLabel = hintsLeft === Infinity ? '∞' : hintsLeft;

    hudContainer.innerHTML = `
        <div class="hud">
            <div class="hud-left">
                <button class="hud-btn" id="btn-menu" title="Menu">✕</button>
                <span class="hud-level">Level ${level.levelNumber}</span>
                <span class="hud-color-dots">${colorDots}</span>
            </div>
            <div class="hud-center">
                <span class="hud-nodes" id="hud-nodes">0 / ${level.vertexCount}</span>
                <span class="hud-timer" id="hud-timer">0:00</span>
            </div>
            <div class="hud-right">
                <button class="hud-btn hud-hint-btn" id="btn-hint" title="Hint">
                    💡<span class="hint-count" id="hint-count">${hintLabel}</span>
                </button>
                <button class="hud-btn" id="btn-undo" title="Undo">↩</button>
                <button class="hud-btn" id="btn-reset" title="Reset">⟲</button>
            </div>
        </div>
    `;

    document.getElementById('btn-menu').addEventListener('click', () => showPauseOverlay());
    document.getElementById('btn-hint').addEventListener('click', () => gameCallbacks.hint());
    document.getElementById('btn-undo').addEventListener('click', () => gameCallbacks.undo());
    document.getElementById('btn-reset').addEventListener('click', () => gameCallbacks.reset());
}

/**
 * Update HUD values.
 */
export function updateHUD(puzzle) {
    const nodesEl = document.getElementById('hud-nodes');
    const timerEl = document.getElementById('hud-timer');
    const hintCountEl = document.getElementById('hint-count');
    const hintBtn = document.getElementById('btn-hint');

    if (nodesEl) {
        nodesEl.textContent = `${puzzle.visitedNodes.size} / ${puzzle.level.vertexCount}`;
    }
    if (timerEl) {
        const elapsed = puzzle.getElapsedTime();
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    if (hintCountEl) {
        const hintsLeft = puzzle.hintsRemaining;
        hintCountEl.textContent = hintsLeft === Infinity ? '∞' : hintsLeft;
    }
    if (hintBtn) {
        hintBtn.classList.toggle('disabled', !puzzle.canUseHint());
    }
}

/**
 * Hide HUD.
 */
export function hideHUD() {
    if (hudContainer) hudContainer.innerHTML = '';
}

/**
 * Show pause/menu overlay.
 */
export function showPauseOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay pause-overlay';
    overlay.id = 'pause-overlay';
    overlay.innerHTML = `
        <div class="overlay-panel">
            <h2>Paused</h2>
            <div class="overlay-buttons">
                <button class="btn btn-primary" id="btn-resume">Resume</button>
                <button class="btn btn-secondary" id="btn-restart">Restart Level</button>
                <button class="btn btn-secondary" id="btn-levels-pause">Level Select</button>
                <button class="btn btn-secondary" id="btn-quit">Main Menu</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    document.getElementById('btn-resume').addEventListener('click', () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 300);
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
        overlay.remove();
        gameCallbacks.reset();
    });
    document.getElementById('btn-levels-pause').addEventListener('click', () => {
        overlay.remove();
        hideHUD();
        gameCallbacks.stopGame();
        showLevelSelect();
    });
    document.getElementById('btn-quit').addEventListener('click', () => {
        overlay.remove();
        hideHUD();
        gameCallbacks.stopGame();
        showTitle();
    });
}

/**
 * Show victory screen.
 */
export function showWinScreen(level, puzzle) {
    setScreen(SCREENS.WIN);
    const stars = puzzle.getStars();
    const elapsed = puzzle.getElapsedTime();
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);

    let starsHTML = '';
    for (let s = 1; s <= 3; s++) {
        const delay = s * 200;
        starsHTML += `<span class="win-star ${s <= stars ? 'earned' : ''}" style="animation-delay: ${delay}ms">${s <= stars ? '★' : '☆'}</span>`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'overlay win-overlay';
    overlay.id = 'win-overlay';
    overlay.innerHTML = `
        <div class="overlay-panel win-panel">
            <h2 class="win-title">Level Complete!</h2>
            <p class="win-level">Level ${level.levelNumber}</p>
            <div class="win-stars">${starsHTML}</div>
            <div class="win-stats">
                <div class="win-stat">
                    <span class="win-stat-value">${puzzle.moveCount}</span>
                    <span class="win-stat-label">Moves</span>
                </div>
                <div class="win-stat">
                    <span class="win-stat-value">${mins}:${secs.toString().padStart(2, '0')}</span>
                    <span class="win-stat-label">Time</span>
                </div>
                <div class="win-stat">
                    <span class="win-stat-value">${level.vertexCount}</span>
                    <span class="win-stat-label">Nodes</span>
                </div>
            </div>
            <div class="overlay-buttons">
                <button class="btn btn-primary" id="btn-next">Next Level →</button>
                <button class="btn btn-secondary" id="btn-replay">Replay</button>
                <button class="btn btn-secondary" id="btn-levels-win">Levels</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // Save progress
    Save.markSolved(level.levelNumber, elapsed, puzzle.moveCount, stars);

    document.getElementById('btn-next').addEventListener('click', () => {
        overlay.classList.remove('visible');
        setTimeout(() => {
            overlay.remove();
            gameCallbacks.startLevel(level.levelNumber + 1);
        }, 300);
    });
    document.getElementById('btn-replay').addEventListener('click', () => {
        overlay.classList.remove('visible');
        setTimeout(() => {
            overlay.remove();
            gameCallbacks.startLevel(level.levelNumber);
        }, 300);
    });
    document.getElementById('btn-levels-win').addEventListener('click', () => {
        overlay.classList.remove('visible');
        setTimeout(() => {
            overlay.remove();
            hideHUD();
            gameCallbacks.stopGame();
            showLevelSelect();
        }, 300);
    });
}

/**
 * Show settings screen.
 */
export function showSettings() {
    setScreen(SCREENS.SETTINGS);
    const settings = Save.getSettings();

    uiContainer.innerHTML = `
        <div class="screen settings-screen">
            <div class="screen-header">
                <button class="btn btn-back" id="btn-back-settings">← Back</button>
                <h2 class="screen-title">Settings</h2>
                <div></div>
            </div>
            <div class="settings-list">
                <label class="setting-row">
                    <span>Background Music</span>
                    <input type="checkbox" id="setting-music" ${settings.musicEnabled ? 'checked' : ''}>
                </label>
                <label class="setting-row">
                    <span>Sound Effects</span>
                    <input type="checkbox" id="setting-sfx" ${settings.sfxEnabled ? 'checked' : ''}>
                </label>
                <label class="setting-row">
                    <span>High Contrast Mode</span>
                    <input type="checkbox" id="setting-contrast" ${settings.highContrast ? 'checked' : ''}>
                </label>
                <label class="setting-row">
                    <span>Show Timer</span>
                    <input type="checkbox" id="setting-timer" ${settings.showTimer ? 'checked' : ''}>
                </label>
                <div class="setting-row setting-freeplay">
                    <div class="setting-freeplay-info">
                        <span>Free Play Mode</span>
                        <p class="setting-desc">Unlocks all levels and gives unlimited hints. Progress is still saved normally.</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="setting-freeplay" ${settings.freePlay ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="setting-row danger">
                    <span>Reset All Progress</span>
                    <button class="btn btn-danger" id="btn-reset-save">Reset</button>
                </div>
            </div>
            <div class="settings-footer">
                <p class="version-text">${CONFIG.GAME_TITLE} v${CONFIG.VERSION}</p>
            </div>
        </div>
    `;

    document.getElementById('btn-back-settings').addEventListener('click', () => showTitle());
    document.getElementById('setting-music').addEventListener('change', (e) => {
        if (gameCallbacks.setMusicEnabled) gameCallbacks.setMusicEnabled(e.target.checked);
    });
    document.getElementById('setting-sfx').addEventListener('change', (e) => {
        if (gameCallbacks.setSfxEnabled) gameCallbacks.setSfxEnabled(e.target.checked);
    });
    document.getElementById('setting-contrast').addEventListener('change', (e) => {
        Save.updateSetting('highContrast', e.target.checked);
    });
    document.getElementById('setting-timer').addEventListener('change', (e) => {
        Save.updateSetting('showTimer', e.target.checked);
    });
    document.getElementById('setting-freeplay').addEventListener('change', (e) => {
        Save.updateSetting('freePlay', e.target.checked);
    });
    document.getElementById('btn-reset-save').addEventListener('click', () => {
        if (confirm('Reset all progress? This cannot be undone.')) {
            Save.resetSave();
            showTitle();
        }
    });
}

/**
 * Show a "stuck" notification when no valid moves remain.
 */
export function showStuckNotice() {
    const existing = document.getElementById('stuck-notice');
    if (existing) existing.remove();

    const notice = document.createElement('div');
    notice.id = 'stuck-notice';
    notice.className = 'stuck-notice';
    notice.innerHTML = `
        <span>No moves left!</span>
        <button class="btn btn-small" id="btn-stuck-undo">Undo</button>
        <button class="btn btn-small" id="btn-stuck-reset">Reset</button>
    `;
    hudContainer.appendChild(notice);
    requestAnimationFrame(() => notice.classList.add('visible'));

    document.getElementById('btn-stuck-undo').addEventListener('click', () => {
        notice.remove();
        gameCallbacks.undo();
    });
    document.getElementById('btn-stuck-reset').addEventListener('click', () => {
        notice.remove();
        gameCallbacks.reset();
    });
}

/**
 * Remove stuck notice if present.
 */
export function hideStuckNotice() {
    const existing = document.getElementById('stuck-notice');
    if (existing) existing.remove();
}

