// ═══════════════════════════════════════════════════════════
// Unbroken — Main Entry Point
// ═══════════════════════════════════════════════════════════

import { CONFIG } from './config.js';
import { generateLevel, relayoutLevel } from './levelgen.js';
import { Puzzle } from './puzzle.js';
import { renderGame } from './renderer.js';
import { initInput, updateInputVertices } from './input.js';
import { SCREENS, getScreen } from './state.js';
import * as Save from './save.js';
import * as UI from './ui.js';
import * as Audio from './audio.js';
import {
    updateEffects, spawnParticles, spawnWinParticles,
    pulseVertex, screenShake, clearEffects,
} from './effects.js';

// ── DOM Elements ──
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const uiContainer = document.getElementById('ui-container');
const hudContainer = document.getElementById('hud-container');

// ── Game State ──
let currentLevel = null;
let puzzle = null;
let hoverVertex = -1;
let isPlaying = false;
let rafId = null;

// ── Initialize ──
function init() {
    Save.loadSave();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Keyboard shortcuts
    window.addEventListener('keydown', handleKeyboard);

    // Input callbacks
    initInput(canvas, {
        onVertexClick: handleVertexClick,
        onVertexHover: (idx) => { hoverVertex = idx; },
    });

    // Unlock audio on first user interaction
    const unlockAudio = () => {
        Audio.unlock();
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);

    // UI callbacks
    UI.initUI(uiContainer, hudContainer, {
        startLevel,
        hint: handleHint,
        undo: handleUndo,
        reset: handleReset,
        stopGame,
        setMusicEnabled: Audio.setMusicEnabled,
        setSfxEnabled: Audio.setSfxEnabled,
    });

    // Show title
    UI.showTitle();
    startGameLoop();
}

// ── Canvas Sizing ──
function resizeCanvas() {
    const size = Math.min(
        window.innerWidth,
        window.innerHeight - 120,
        1000
    );
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    // DPR scaling is handled in the render loop via setTransform

    // Re-layout current level if playing
    if (currentLevel) {
        relayoutLevel(currentLevel, size);
        if (puzzle) {
            updateInputVertices(currentLevel.vertices);
        }
    }
}

function getCanvasSize() {
    return parseInt(canvas.style.width) || 600;
}

// ── Level Management ──
function startLevel(levelNumber) {
    clearEffects();
    UI.hideStuckNotice();

    const size = getCanvasSize();
    currentLevel = generateLevel(levelNumber, size);

    if (!currentLevel) {
        console.error('Failed to generate level', levelNumber);
        return;
    }

    puzzle = new Puzzle(currentLevel);
    isPlaying = true;
    hoverVertex = -1;

    updateInputVertices(currentLevel.vertices);
    UI.showHUD(currentLevel, puzzle);
    Save.setCurrentLevel(levelNumber);

    // Show canvas
    canvas.classList.add('visible');
}

function stopGame() {
    isPlaying = false;
    puzzle = null;
    currentLevel = null;
    canvas.classList.remove('visible');
    clearEffects();
}

// ── Player Actions ──
function handleVertexClick(vertexIdx) {
    if (!puzzle || !isPlaying || puzzle.isComplete) return;
    if (getScreen() !== SCREENS.PLAYING) return;

    UI.hideStuckNotice();

    const result = puzzle.makeMove(vertexIdx);

    if (result.success) {
        pulseVertex(vertexIdx);
        Audio.playEdgeDraw(puzzle.moveCount, currentLevel.vertexCount);

        if (result.complete) {
            handleWin();
        } else {
            // Check if stuck
            if (!puzzle.isSolvable()) {
                UI.showStuckNotice();
            }
        }
    } else {
        // Invalid move feedback
        if (result.invalidReason === 'no_edge' || result.invalidReason === 'edge_used' ||
            result.invalidReason === 'node_visited' || result.invalidReason === 'wrong_color') {
            screenShake(3, 150);
            Audio.playInvalidMove();
        }
    }
}

function handleWin() {
    // Celebration effects
    spawnWinParticles(currentLevel.vertices, currentLevel.graph.edges);
    Audio.playWin();

    // Delay win screen slightly so player sees the completed shape
    setTimeout(() => {
        UI.showWinScreen(currentLevel, puzzle);
    }, CONFIG.ANIM.WIN_DELAY);
}

function handleUndo() {
    if (!puzzle || !isPlaying) return;
    puzzle.undo();
    Audio.playUndo();
    UI.hideStuckNotice();
}

function handleReset() {
    if (!puzzle || !isPlaying) return;
    puzzle.reset();
    Audio.playReset();
    clearEffects();
    UI.hideStuckNotice();
}

function handleHint() {
    if (!puzzle || !isPlaying || puzzle.isComplete) return;
    if (!puzzle.canUseHint()) {
        screenShake(2, 100);
        return;
    }
    puzzle.showHint();
    Audio.playHint();
    UI.updateHUD(puzzle);
}

// ── Keyboard Shortcuts ──
function handleKeyboard(e) {
    if (getScreen() !== SCREENS.PLAYING) return;

    switch (e.key) {
        case 'z':
        case 'Z':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                handleUndo();
            }
            break;
        case 'u':
            handleUndo();
            break;
        case 'r':
            handleReset();
            break;
        case 'h':
            handleHint();
            break;
        case 'Escape':
            UI.showPauseOverlay();
            break;
    }
}

// ── Game Loop ──
function startGameLoop() {
    function loop(timestamp) {
        update(timestamp);
        render(timestamp);
        rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
}

function update(timestamp) {
    updateEffects();

    if (puzzle && isPlaying) {
        UI.updateHUD(puzzle);
    }
}

function render(timestamp) {
    // Always clear & render background even on menu screens
    const size = getCanvasSize();

    if (isPlaying && puzzle) {
        ctx.save();
        ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
        const hc = Save.getSettings().highContrast || false;
        renderGame(ctx, { width: size, height: size }, puzzle, hoverVertex, timestamp, hc);
        ctx.restore();
    }
}

// ── Start ──
init();
