// ═══════════════════════════════════════════════════════════
// Unbroken — Adaptive Audio Engine
// ═══════════════════════════════════════════════════════════
//
// Dynamically evolving generative music that responds to gameplay.
// - 4 moods (ambient, flowing, tense, triumph) with chord progressions
// - 5 vertical layers fade in/out with player progress
// - All SFX harmonically locked to the current chord
// - Master lowpass filter + compressor for polish
// ═══════════════════════════════════════════════════════════

import * as Save from './save.js';

let ctx = null;
let masterGain = null;     // master volume
let musicGain = null;      // music sub-bus
let sfxGain = null;        // sfx sub-bus
let masterFilter = null;   // lowpass filter for mood
let compressor = null;     // dynamics compressor

let currentMood = 'ambient';
let currentChordIdx = 0;
let progress = 0;          // 0–1 level completion ratio
let arpStep = 0;
let arpTimer = null;
let pulseTimer = null;
let bellTimer = null;
let chordChangeTimer = null;

// Active audio nodes for cleanup
let padNodes = [];
let bassNode = null;

// ── Musical Data ──

// Note frequencies (A4 = 440)
const NOTE = {
    C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.0, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.0, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.0, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
    C6: 1046.5,
    // Flats for dissonance
    Db4: 277.18, Gb4: 369.99, Bb3: 233.08, Eb4: 311.13,
};

// Chord definitions: [root, notes for pad, arp pattern, bass note]
const CHORDS = {
    // Major / bright
    Cmaj7:  { pad: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.B4], bass: NOTE.C2, arp: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.B4, NOTE.C5, NOTE.E5], dissonant: [NOTE.Db4, NOTE.Gb4] },
    Fmaj7:  { pad: [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4], bass: NOTE.F2, arp: [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4, NOTE.F4, NOTE.A4], dissonant: [NOTE.Gb4, NOTE.Db4] },
    G7:     { pad: [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.F4], bass: NOTE.G2, arp: [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.F4, NOTE.G4, NOTE.B4], dissonant: [NOTE.Db4, NOTE.Eb4] },
    Dm7:    { pad: [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.C4], bass: NOTE.D2, arp: [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.C4, NOTE.D4, NOTE.F4], dissonant: [NOTE.Db4, NOTE.Eb4] },
    // Minor / tense
    Am7:    { pad: [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.G4], bass: NOTE.A2, arp: [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.C5], dissonant: [NOTE.Bb3, NOTE.Db4] },
    Em7:    { pad: [NOTE.E3, NOTE.G3, NOTE.B3, NOTE.D4], bass: NOTE.E2, arp: [NOTE.E3, NOTE.G3, NOTE.B3, NOTE.D4, NOTE.E4, NOTE.G4], dissonant: [NOTE.Eb4, NOTE.Bb3] },
    Dm9:    { pad: [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.E4], bass: NOTE.D2, arp: [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4, NOTE.F4], dissonant: [NOTE.Db4, NOTE.Eb4] },
};

// Mood → chord progression cycle
const MOOD_CHORDS = {
    ambient: ['Cmaj7', 'Fmaj7'],
    flowing: ['Cmaj7', 'Fmaj7', 'G7', 'Dm7'],
    tense:   ['Am7', 'Em7', 'Dm9'],
    triumph: ['Fmaj7', 'G7', 'Cmaj7'],
};

// Mood → parameters
const MOOD_PARAMS = {
    ambient: { tempo: 60,  filterFreq: 800,  padVol: 0.06, bassVol: 0.03, arpVol: 0, bellVol: 0, pulseVol: 0 },
    flowing: { tempo: 72,  filterFreq: 2500, padVol: 0.07, bassVol: 0.04, arpVol: 0.04, bellVol: 0.02, pulseVol: 0.015 },
    tense:   { tempo: 54,  filterFreq: 600,  padVol: 0.05, bassVol: 0.04, arpVol: 0.02, bellVol: 0, pulseVol: 0 },
    triumph: { tempo: 96,  filterFreq: 4000, padVol: 0.08, bassVol: 0.05, arpVol: 0.06, bellVol: 0.04, pulseVol: 0.025 },
};

// ── Initialization ──

function ensureCtx() {
    if (ctx) return true;
    try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Master chain: compressor → filter → gain → destination
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;

        masterFilter = ctx.createBiquadFilter();
        masterFilter.type = 'lowpass';
        masterFilter.frequency.value = 800;
        masterFilter.Q.value = 0.7;

        masterGain = ctx.createGain();
        masterGain.gain.value = 1.0;

        musicGain = ctx.createGain();
        sfxGain = ctx.createGain();

        musicGain.connect(compressor);
        sfxGain.connect(compressor);
        compressor.connect(masterFilter);
        masterFilter.connect(masterGain);
        masterGain.connect(ctx.destination);

        syncSettings();
        return true;
    } catch {
        return false;
    }
}

export function unlock() {
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume();
    const settings = Save.getSettings();
    if (settings.musicEnabled && padNodes.length === 0) {
        startMusic();
    }
}

// ── Settings ──

export function syncSettings() {
    const settings = Save.getSettings();
    if (musicGain) {
        const target = settings.musicEnabled ? 1.0 : 0;
        musicGain.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
        if (settings.musicEnabled && ctx && padNodes.length === 0) startMusic();
        if (!settings.musicEnabled) stopMusic();
    }
    if (sfxGain) {
        sfxGain.gain.value = settings.sfxEnabled ? 0.5 : 0;
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

// ── Mood Management ──

export function setMood(mood) {
    if (!ctx || mood === currentMood) return;
    const prevMood = currentMood;
    currentMood = mood;
    currentChordIdx = 0;
    arpStep = 0;

    // Smooth parameter transition
    const params = MOOD_PARAMS[mood];
    const now = ctx.currentTime;
    const fade = 1.5;

    masterFilter.frequency.setTargetAtTime(params.filterFreq, now, fade * 0.4);

    // Rebuild pad + bass on new chord
    transitionChord(0, fade);

    // Restart rhythmic layers with new tempo
    restartArpeggiator(params);
    restartPulse(params);
    restartBell(params);
    restartChordCycle(params);
}

export function getMood() {
    return currentMood;
}

export function setProgress(ratio) {
    if (!ctx) return;
    progress = Math.max(0, Math.min(1, ratio));

    // Dynamic filter opening — more progress = brighter
    if (currentMood === 'flowing') {
        const base = MOOD_PARAMS.flowing.filterFreq;
        const target = base + progress * 2000; // up to 4500Hz
        masterFilter.frequency.setTargetAtTime(target, ctx.currentTime, 0.5);
    }

    // Dynamic tempo — speed up slightly with progress
    if (currentMood === 'flowing') {
        // Will affect next arp/pulse tick naturally
    }
}

// ── Chord Transitions ──

function getChord() {
    const progression = MOOD_CHORDS[currentMood] || MOOD_CHORDS.ambient;
    const name = progression[currentChordIdx % progression.length];
    return CHORDS[name];
}

function transitionChord(newIdx, fadeTime = 1.5) {
    currentChordIdx = newIdx;
    const chord = getChord();
    const now = ctx.currentTime;

    // Fade out old pad
    padNodes.forEach(n => {
        try {
            n.gain.gain.setTargetAtTime(0.001, now, fadeTime * 0.3);
            setTimeout(() => {
                try { n.osc.stop(); n.osc.disconnect(); n.gain.disconnect(); if (n.lfo) { n.lfo.stop(); n.lfo.disconnect(); } } catch {}
            }, fadeTime * 1000 + 500);
        } catch {}
    });
    padNodes = [];

    // Fade out old bass
    if (bassNode) {
        try {
            bassNode.gain.gain.setTargetAtTime(0.001, now, fadeTime * 0.3);
            setTimeout(() => {
                try { bassNode.osc.stop(); bassNode.osc.disconnect(); bassNode.gain.disconnect(); } catch {}
            }, fadeTime * 1000 + 500);
        } catch {}
        bassNode = null;
    }

    // Build new pad
    const params = MOOD_PARAMS[currentMood];
    buildPad(chord, params, fadeTime);
    buildBass(chord, params, fadeTime);
}

function advanceChord() {
    const progression = MOOD_CHORDS[currentMood] || MOOD_CHORDS.ambient;
    const nextIdx = (currentChordIdx + 1) % progression.length;
    transitionChord(nextIdx, 2.0);
    arpStep = 0;
}

// ── Layer: Pad (sustained chord) ──

function buildPad(chord, params, fadeIn = 1.5) {
    const now = ctx.currentTime;
    const targetVol = params.padVol;

    chord.pad.forEach((freq, i) => {
        // Main voice
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.setTargetAtTime(targetVol, now, fadeIn * 0.4);

        // Subtle detune LFO for warmth
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 0.06 + i * 0.025;
        lfoGain.gain.value = 1.5; // subtle detune in cents via freq
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);

        osc.connect(gain);
        gain.connect(musicGain);
        lfo.start(now);
        osc.start(now);

        padNodes.push({ osc, gain, lfo });

        // Second detuned voice for richness
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 1.002; // slight detune
        gain2.gain.setValueAtTime(0.001, now);
        gain2.gain.setTargetAtTime(targetVol * 0.5, now, fadeIn * 0.4);
        osc2.connect(gain2);
        gain2.connect(musicGain);
        osc2.start(now);

        padNodes.push({ osc: osc2, gain: gain2 });
    });
}

// ── Layer: Bass ──

function buildBass(chord, params, fadeIn = 1.5) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = chord.bass;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.setTargetAtTime(params.bassVol, now, fadeIn * 0.4);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(now);
    bassNode = { osc, gain };
}

// ── Layer: Arpeggiator ──

function restartArpeggiator(params) {
    if (arpTimer) clearInterval(arpTimer);
    if (params.arpVol <= 0) return;

    const intervalMs = (60 / params.tempo) * 500; // 8th notes
    arpTimer = setInterval(() => {
        if (!ctx || !Save.getSettings().musicEnabled) return;

        // Only play if progress warrants it or mood is triumph
        const shouldPlay = currentMood === 'triumph' || progress >= 0.15;
        if (!shouldPlay) return;

        const chord = getChord();
        const notes = chord.arp;
        const note = notes[arpStep % notes.length];
        arpStep++;

        // Dynamic volume based on progress
        let vol = params.arpVol;
        if (currentMood === 'flowing') {
            vol *= Math.min(1, progress * 2.5); // fades in with progress
        }

        playMusicNote(note, 0.15, 'triangle', vol);
    }, intervalMs);
}

// ── Layer: Bell/Pluck (FM synthesis) ──

function restartBell(params) {
    if (bellTimer) clearInterval(bellTimer);
    if (params.bellVol <= 0) return;

    const intervalMs = (60 / params.tempo) * 2000; // every 2 beats
    bellTimer = setInterval(() => {
        if (!ctx || !Save.getSettings().musicEnabled) return;
        if (currentMood === 'flowing' && progress < 0.4) return;

        const chord = getChord();
        const notes = chord.arp;
        // Pick a high note
        const note = notes[Math.floor(Math.random() * 2) + 4] || notes[notes.length - 1];

        playBellNote(note, params.bellVol);
    }, intervalMs);
}

function playBellNote(freq, vol) {
    if (!ctx) return;
    const now = ctx.currentTime;

    // Carrier
    const carrier = ctx.createOscillator();
    const carrierGain = ctx.createGain();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    // Modulator (FM synthesis)
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    mod.type = 'sine';
    mod.frequency.value = freq * 2.01; // slight detuned harmonic
    modGain.gain.value = freq * 0.5;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Envelope
    carrierGain.gain.setValueAtTime(vol, now);
    carrierGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    carrier.connect(carrierGain);
    carrierGain.connect(musicGain);
    mod.start(now);
    carrier.start(now);
    carrier.stop(now + 1.5);
    mod.stop(now + 1.5);
}

// ── Layer: Pulse ──

function restartPulse(params) {
    if (pulseTimer) clearInterval(pulseTimer);
    if (params.pulseVol <= 0) return;

    const intervalMs = (60 / params.tempo) * 1000; // quarter notes
    pulseTimer = setInterval(() => {
        if (!ctx || !Save.getSettings().musicEnabled) return;
        if (currentMood === 'flowing' && progress < 0.6) return;

        const chord = getChord();

        // Filtered click/pulse on the root
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'square';
        osc.frequency.value = chord.bass * 4; // 2 octaves up from bass
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        filter.Q.value = 5;

        gain.gain.setValueAtTime(params.pulseVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(musicGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }, intervalMs);
}

// ── Chord Cycling ──

function restartChordCycle(params) {
    if (chordChangeTimer) clearInterval(chordChangeTimer);
    // Change chord every 4 bars
    const barMs = (60 / params.tempo) * 4000;
    chordChangeTimer = setInterval(() => {
        if (!ctx || !Save.getSettings().musicEnabled) return;
        advanceChord();
    }, barMs);
}

// ── Helper: Play a note on the music bus ──

function playMusicNote(freq, duration, type = 'triangle', volume = 0.04) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
}

// ── SFX (harmonically locked to current chord) ──

function playSfxTone(freq, duration, type = 'sine', volume = 0.3, attack = 0.008) {
    if (!ctx) return;
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

/** Edge drawn — next chord tone ascending */
export function playEdgeDraw(moveIndex, totalNodes) {
    if (!ensureCtx()) return;
    const chord = getChord();
    const idx = Math.min(moveIndex, chord.arp.length - 1);
    const freq = chord.arp[idx];
    playSfxTone(freq, 0.2, 'sine', 0.25);
    // Also a soft harmonic above
    playSfxTone(freq * 2, 0.12, 'sine', 0.08);
}

/** Invalid move — dissonant note + short filter sweep */
export function playInvalidMove() {
    if (!ensureCtx()) return;
    const chord = getChord();
    const dis = chord.dissonant[Math.floor(Math.random() * chord.dissonant.length)];

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.value = dis;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.2);
    filter.Q.value = 3;

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
}

/** Win — ascending arpeggio through 2 octaves of chord tones */
export function playWin() {
    if (!ensureCtx()) return;
    const chord = getChord();
    const notes = [...chord.arp, ...chord.arp.map(n => n * 2)];
    notes.forEach((freq, i) => {
        const delay = i * 0.08;
        setTimeout(() => playSfxTone(freq, 0.5, 'sine', 0.2), delay * 1000);
    });
}

/** Undo — descending chord tone */
export function playUndo() {
    if (!ensureCtx()) return;
    const chord = getChord();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(chord.arp[3] || chord.arp[2], now);
    osc.frequency.exponentialRampToValueAtTime(chord.arp[0], now + 0.2);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
}

/** Hint — two highest chord tones as chime */
export function playHint() {
    if (!ensureCtx()) return;
    const chord = getChord();
    const len = chord.arp.length;
    playSfxTone(chord.arp[len - 2], 0.3, 'sine', 0.2);
    setTimeout(() => playSfxTone(chord.arp[len - 1], 0.25, 'sine', 0.18), 80);
}

/** Reset — root note descending an octave */
export function playReset() {
    if (!ensureCtx()) return;
    const chord = getChord();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(chord.arp[0] * 2, now);
    osc.frequency.exponentialRampToValueAtTime(chord.arp[0], now + 0.25);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.35);
}

// ── Music Start/Stop ──

function startMusic() {
    if (!ctx || padNodes.length > 0) return;
    currentChordIdx = 0;
    arpStep = 0;
    progress = 0;

    const params = MOOD_PARAMS[currentMood];
    const chord = getChord();
    buildPad(chord, params, 2.0);
    buildBass(chord, params, 2.0);
    restartArpeggiator(params);
    restartBell(params);
    restartPulse(params);
    restartChordCycle(params);
}

function stopMusic() {
    // Stop all timers
    if (arpTimer) { clearInterval(arpTimer); arpTimer = null; }
    if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
    if (bellTimer) { clearInterval(bellTimer); bellTimer = null; }
    if (chordChangeTimer) { clearInterval(chordChangeTimer); chordChangeTimer = null; }

    // Fade out pad
    const now = ctx ? ctx.currentTime : 0;
    padNodes.forEach(n => {
        try {
            n.gain.gain.setTargetAtTime(0.001, now, 0.3);
            setTimeout(() => {
                try { n.osc.stop(); n.osc.disconnect(); n.gain.disconnect(); if (n.lfo) { n.lfo.stop(); n.lfo.disconnect(); } } catch {}
            }, 1000);
        } catch {}
    });
    padNodes = [];

    if (bassNode) {
        try {
            bassNode.gain.gain.setTargetAtTime(0.001, now, 0.3);
            setTimeout(() => {
                try { bassNode.osc.stop(); bassNode.osc.disconnect(); bassNode.gain.disconnect(); } catch {}
            }, 1000);
        } catch {}
        bassNode = null;
    }
}
