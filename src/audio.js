// ═══════════════════════════════════════════════════════════
// Unbroken — Audio Engine (Web Audio API Synthesis)
// ═══════════════════════════════════════════════════════════

import { CONFIG } from './config.js';
import * as Save from './save.js';

let ctx = null;           // AudioContext (lazy init)
let musicGain = null;     // GainNode for background music
let sfxGain = null;       // GainNode for sound effects
let musicPlaying = false;
let musicNodes = [];      // active oscillators for music

// Pentatonic scale notes (A minor pentatonic) — zen/chill
const PENTA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];

// ── Lazy Audio Context Init ──
function ensureCtx() {
    if (ctx) return true;
    try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        musicGain = ctx.createGain();
        musicGain.connect(ctx.destination);
        sfxGain = ctx.createGain();
        sfxGain.connect(ctx.destination);
        syncSettings();
        return true;
    } catch {
        return false;
    }
}

/** Must be called after a user gesture to unlock audio */
export function unlock() {
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    const settings = Save.getSettings();
    if (settings.musicEnabled && !musicPlaying) {
        startMusic();
    }
}

// ── Settings Sync ──
export function syncSettings() {
    const settings = Save.getSettings();
    if (musicGain) musicGain.gain.value = settings.musicEnabled ? 0.12 : 0;
    if (sfxGain) sfxGain.gain.value = settings.sfxEnabled ? 0.35 : 0;
    if (settings.musicEnabled && ctx && !musicPlaying) {
        startMusic();
    } else if (!settings.musicEnabled && musicPlaying) {
        stopMusic();
    }
}

export function setMusicEnabled(on) {
    Save.updateSetting('musicEnabled', on);
    syncSettings();
}

export function setSfxEnabled(on) {
    Save.updateSetting('sfxEnabled', on);
    syncSettings();
}

// ── Sound Effect Helpers ──
function playTone(freq, duration, type = 'sine', attack = 0.01, decay = 0.15, volume = 0.5) {
    if (!ensureCtx()) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
}

// ── Sound Effects ──

/** Soft click when selecting a node — gentle pluck */
export function playNodeClick() {
    if (!ensureCtx()) return;
    const freq = PENTA[Math.floor(Math.random() * 5)] * 2; // higher octave
    playTone(freq, 0.12, 'triangle', 0.005, 0.08, 0.4);
}

/** Gentle ascending tone when edge is drawn */
export function playEdgeDraw(moveIndex, totalNodes) {
    if (!ensureCtx()) return;
    // Progress through pentatonic scale as you progress through the level
    const idx = Math.min(Math.floor((moveIndex / totalNodes) * PENTA.length), PENTA.length - 1);
    const freq = PENTA[idx];
    playTone(freq, 0.18, 'sine', 0.008, 0.1, 0.35);
}

/** Short low buzz on invalid move */
export function playInvalidMove() {
    if (!ensureCtx()) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.linearRampToValueAtTime(60, now + 0.12);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
}

/** Ascending arpeggio celebration on level complete */
export function playWin() {
    if (!ensureCtx()) return;
    const notes = [329.63, 392, 440, 523.25, 659.25]; // E4 G4 A4 C5 E5
    notes.forEach((freq, i) => {
        const delay = i * 0.1;
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(now);
        osc.stop(now + 0.5);
    });
}

/** Soft descending note on undo */
export function playUndo() {
    if (!ensureCtx()) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
}

/** Gentle chime on hint reveal */
export function playHint() {
    if (!ensureCtx()) return;
    playTone(783.99, 0.25, 'sine', 0.01, 0.15, 0.25);
    setTimeout(() => playTone(1046.5, 0.2, 'sine', 0.01, 0.12, 0.2), 80);
}

/** Quick soft sweep on reset */
export function playReset() {
    if (!ensureCtx()) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
}

// ── Background Music (Generative Ambient Pad) ──

function startMusic() {
    if (!ctx || musicPlaying) return;
    musicPlaying = true;

    // Layered ambient drone: soft chord that evolves slowly
    const chordFreqs = [130.81, 196, 261.63, 329.63]; // C3 G3 C4 E4

    chordFreqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        // Main oscillator — soft pad
        osc.type = 'sine';
        osc.frequency.value = freq;

        // Subtle LFO tremolo for movement
        lfo.type = 'sine';
        lfo.frequency.value = 0.08 + i * 0.03; // very slow, different per voice
        lfoGain.gain.value = 0.03; // very subtle volume modulation

        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);

        gain.gain.value = 0.03; // very quiet base
        osc.connect(gain);
        gain.connect(musicGain);

        lfo.start();
        osc.start();

        musicNodes.push({ osc, gain, lfo, lfoGain });
    });

    // Add a second layer: very quiet high shimmer
    const shimmerFreqs = [523.25, 659.25]; // C5, E5
    shimmerFreqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;

        lfo.type = 'sine';
        lfo.frequency.value = 0.05 + i * 0.02;
        lfoGain.gain.value = 0.015;

        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);

        gain.gain.value = 0.012;
        osc.connect(gain);
        gain.connect(musicGain);

        lfo.start();
        osc.start();

        musicNodes.push({ osc, gain, lfo, lfoGain });
    });
}

function stopMusic() {
    musicNodes.forEach(n => {
        try {
            n.osc.stop();
            n.lfo.stop();
            n.osc.disconnect();
            n.lfo.disconnect();
            n.gain.disconnect();
            n.lfoGain.disconnect();
        } catch {}
    });
    musicNodes = [];
    musicPlaying = false;
}
