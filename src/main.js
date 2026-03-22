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

    // Gentle energy lift on level start (music continues from where it was)
    Audio.nudgeEnergy(0.05);
    Audio.nudgeValence(0.05);

    // Show canvas
    canvas.classList.add('visible');
}

function stopGame() {
    isPlaying = false;
    puzzle = null;
    currentLevel = null;
    canvas.classList.remove('visible');
    clearEffects();
    // Music persists — just let energy decay naturally
    Audio.nudgeEnergy(-0.1);
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
        Audio.setProgress(puzzle.moveCount / currentLevel.vertexCount);
        Audio.nudgeValence(0.06);  // each successful move brightens the mood

        if (result.complete) {
            handleWin();
        } else {
            // Check if stuck
            if (!puzzle.isSolvable()) {
                UI.showStuckNotice();
                Audio.nudgeEnergy(-0.2);
                Audio.nudgeValence(-0.35);
            }
        }
    } else {
        // Invalid move feedback
        if (result.invalidReason === 'no_edge' || result.invalidReason === 'edge_used' ||
            result.invalidReason === 'node_visited' || result.invalidReason === 'wrong_color') {
            screenShake(3, 150);
            Audio.playInvalidMove();
            Audio.nudgeValence(-0.12);
        }
    }
}

function handleWin() {
    // Celebration effects
    spawnWinParticles(currentLevel.vertices, currentLevel.graph.edges);
    Audio.triumphBurst();
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
        case 'd':
        case 'D':
            toggleDebugPanel();
            break;
        case 'Escape':
            UI.showPauseOverlay();
            break;
    }
}

// ── Mood Aura ──
const auraEl = document.getElementById('mood-aura');

function updateAura() {
    const e = Audio.getEnergy();
    const v = Audio.getValence();

    // Color: hue shifts 170 (teal) → 260 (purple) → 320 (magenta)
    // Valence +1 → teal, 0 → purple, -1 → magenta
    const hue = 260 - v * 90;
    const sat = 60 + e * 30;
    const alpha = 0.05 + e * 0.18;
    auraEl.style.setProperty('--aura-color', `hsla(${hue}, ${sat}%, 55%, ${alpha.toFixed(3)})`);

    // Pulse speed: 5s (calm) → 1.5s (intense)
    const speed = 5 - e * 3.5;
    auraEl.style.setProperty('--aura-speed', `${speed.toFixed(1)}s`);

    // Pulse intensity: 1.1 (calm) → 1.8 (intense)
    const brightness = 1.1 + e * 0.7;
    auraEl.style.setProperty('--aura-brightness', brightness.toFixed(2));
}

// ── Debug Panel ──
const debugPanel = document.getElementById('audio-debug');
let debugVisible = false;

function toggleDebugPanel() {
    debugVisible = !debugVisible;
    debugPanel.classList.toggle('hidden', !debugVisible);
}

function updateDebugPanel() {
    if (!debugVisible) return;

    const d = Audio.getDebugInfo();

    // Energy bar
    document.getElementById('dbg-energy-bar').style.width = `${(d.energy * 100).toFixed(0)}%`;
    document.getElementById('dbg-energy-val').textContent = d.energy;

    // Valence bar (map -1..1 to 0..100%)
    const vPct = ((parseFloat(d.valence) + 1) / 2 * 100).toFixed(0);
    document.getElementById('dbg-valence-bar').style.width = `${vPct}%`;
    document.getElementById('dbg-valence-val').textContent = d.valence;

    // Mood badge
    const moodEl = document.getElementById('dbg-mood');
    moodEl.textContent = d.mood;
    moodEl.className = `debug-mood mood-${d.mood}`;

    // BPM
    document.getElementById('dbg-bpm').textContent = `${d.bpm} BPM`;

    // Chord + progression
    document.getElementById('dbg-chord').textContent = d.chord;
    document.getElementById('dbg-prog').textContent = `${d.progType}: ${d.progression}`;

    // Layers
    document.getElementById('dbg-layers').textContent = `Layers: ${d.layers || '—'}`;

    // Beat dots
    const dots = document.querySelectorAll('#dbg-beat .beat-dot');
    const beatInBar = d.beat % 4;
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === beatInBar);
    });
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
    updateAura();
    updateDebugPanel();

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
