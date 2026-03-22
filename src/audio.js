// ═══════════════════════════════════════════════════════════
// Unbroken — Adaptive Audio Engine v2
// ═══════════════════════════════════════════════════════════
//
// Persistent, beat-synchronized generative music.
//   • Energy (0–1) + Valence (−1 to +1) drive the music
//   • Multi-chord progressions cycle at bar boundaries
//   • Progression swaps happen at phrase boundaries (4 bars)
//   • 7 vertical layers fade smoothly with energy
//   • All transitions quantized to the beat clock
//   • Music is continuous across level switches
// ═══════════════════════════════════════════════════════════

import * as Save from './save.js';

// ── Audio Context & Signal Chain ──
let ctx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let masterFilter = null;
let compressor = null;

// ── State ──
let energy = 0.25;       // 0 = calm, 1 = intense
let valence = 0.3;       // −1 = dark/minor, +1 = bright/major
let running = false;

// Beat clock
let bpm = 68;
let targetBpm = 68;
let beat = 0;            // current beat within phrase (0–15)
let beatTimer = null;

// Chord progression
let currentProg = null;  // array of chord objects
let progIdx = 0;         // which chord in progression
let pendingProg = null;  // queued progression swap (applied at phrase boundary)

// Active sound nodes
let padVoices = [];      // [{osc, gain, lfo, lfoGain}]
let bassVoice = null;    // {osc, gain}
let subVoice = null;     // {osc, gain}
let stringVoices = [];   // [{osc, gain, vibLfo, vibGain}]

// ── Note Frequencies ──
const N = {
    C2:65.41,  D2:73.42,  E2:82.41,  F2:87.31,  G2:98,     A2:110,    B2:123.47,
    C3:130.81, D3:146.83, E3:164.81, F3:174.61, G3:196,    A3:220,    Bb3:233.08, B3:246.94,
    C4:261.63, Db4:277.18,D4:293.66, Eb4:311.13,E4:329.63, F4:349.23, Gb4:369.99,
    G4:392,    Ab4:415.3, A4:440,    Bb4:466.16,B4:493.88,
    C5:523.25, D5:587.33, E5:659.25, F5:698.46, G5:783.99, A5:880,    B5:987.77,
    C6:1046.5, D6:1174.66,E6:1318.5,
};

// ── Chord Definitions ──
function chord(bass, pad, arp, dis) { return { bass, pad, arp, dis }; }

const C = {
    Cmaj7:  chord(N.C2, [N.C4,N.E4,N.G4,N.B4],       [N.C4,N.E4,N.G4,N.B4,N.C5,N.E5,N.G5], [N.Db4,N.Gb4]),
    Cmaj:   chord(N.C2, [N.C4,N.E4,N.G4],             [N.C4,N.E4,N.G4,N.C5,N.E5,N.G5],      [N.Db4,N.Gb4]),
    Dm7:    chord(N.D2, [N.D4,N.F4,N.A4,N.C5],        [N.D4,N.F4,N.A4,N.C5,N.D5,N.F5],      [N.Db4,N.Eb4]),
    Em7:    chord(N.E2, [N.E4,N.G4,N.B4,N.D5],        [N.E4,N.G4,N.B4,N.D5,N.E5,N.G5],      [N.Eb4,N.Bb4]),
    Fmaj7:  chord(N.F2, [N.F3,N.A3,N.C4,N.E4],        [N.F3,N.A3,N.C4,N.E4,N.F4,N.A4],      [N.Gb4,N.Db4]),
    Fmaj:   chord(N.F2, [N.F3,N.A3,N.C4],             [N.F3,N.A3,N.C4,N.F4,N.A4,N.C5],      [N.Gb4,N.Db4]),
    G7:     chord(N.G2, [N.G3,N.B3,N.D4,N.F4],        [N.G3,N.B3,N.D4,N.F4,N.G4,N.B4],      [N.Db4,N.Ab4]),
    Am7:    chord(N.A2, [N.A3,N.C4,N.E4,N.G4],        [N.A3,N.C4,N.E4,N.G4,N.A4,N.C5],      [N.Bb3,N.Eb4]),
    Am:     chord(N.A2, [N.A3,N.C4,N.E4],             [N.A3,N.C4,N.E4,N.A4,N.C5,N.E5],      [N.Bb3,N.Eb4]),
    Bdim:   chord(N.B2, [N.B3,N.D4,N.F4],             [N.B3,N.D4,N.F4,N.B4,N.D5,N.F5],      [N.Db4,N.Ab4]),
    Dm9:    chord(N.D2, [N.D3,N.F3,N.A3,N.E4],        [N.D3,N.F3,N.A3,N.C4,N.E4,N.F4],      [N.Db4,N.Eb4]),
    Gsus4:  chord(N.G2, [N.G3,N.C4,N.D4],             [N.G3,N.C4,N.D4,N.G4,N.C5,N.D5],      [N.Db4,N.Ab4]),
    Emin9:  chord(N.E2, [N.E3,N.G3,N.B3,N.D4],        [N.E3,N.G3,N.B3,N.D4,N.E4,N.G4],      [N.Eb4,N.Bb4]),
    Bbmaj:  chord(N.B2, [N.Bb3,N.D4,N.F4],            [N.Bb3,N.D4,N.F4,N.Bb4,N.D5,N.F5],    [N.Db4,N.Ab4]),
};

// ── Chord Progressions (grouped by valence character) ──
// Positive valence → major progressions
const MAJOR_PROGS = [
    [C.Cmaj7, C.Fmaj7, C.G7,   C.Cmaj7],     // I – IV – V – I
    [C.Cmaj7, C.Am7,   C.Fmaj7,C.G7   ],     // I – vi – IV – V
    [C.Fmaj7, C.G7,    C.Em7,  C.Am7  ],     // IV – V – iii – vi
    [C.Cmaj,  C.Fmaj,  C.Dm7,  C.G7   ],     // I – IV – ii – V
    [C.Fmaj7, C.Cmaj7, C.Dm7,  C.Cmaj7],     // IV – I – ii – I
];

// Negative valence → minor progressions
const MINOR_PROGS = [
    [C.Am7,   C.Dm7,   C.Em7,  C.Am7  ],     // i – iv – v – i
    [C.Am7,   C.Fmaj7, C.Dm9,  C.Em7  ],     // i – VI – iv9 – v
    [C.Em7,   C.Am7,   C.Dm7,  C.G7   ],     // v – i – iv – VII
    [C.Am,    C.Emin9, C.Fmaj, C.Gsus4],     // i – v9 – VI – VIIsus
];

// Triumph progressions (resolving, bright)
const TRIUMPH_PROGS = [
    [C.Fmaj7, C.G7,    C.Am7,  C.Cmaj7],     // IV – V – vi – I
    [C.Dm7,   C.G7,    C.Cmaj7,C.Cmaj7],     // ii – V – I – I
];

// ── Initialization ──

function ensureCtx() {
    if (ctx) return true;
    try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();

        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 10;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;

        masterFilter = ctx.createBiquadFilter();
        masterFilter.type = 'lowpass';
        masterFilter.frequency.value = 900;
        masterFilter.Q.value = 0.5;

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
    } catch { return false; }
}

export function unlock() {
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!running && Save.getSettings().musicEnabled) startEngine();
}

// ── Settings ──

export function syncSettings() {
    const s = Save.getSettings();
    if (musicGain) {
        const target = s.musicEnabled ? 1.0 : 0;
        if (ctx) musicGain.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
        if (s.musicEnabled && ctx && !running) startEngine();
        if (!s.musicEnabled && running) stopEngine();
    }
    if (sfxGain) sfxGain.gain.value = s.sfxEnabled ? 0.45 : 0;
}

export function setMusicEnabled(on) {
    Save.updateSetting('musicEnabled', on);
    syncSettings();
}

export function setSfxEnabled(on) {
    Save.updateSetting('sfxEnabled', on);
    syncSettings();
}

// ── Energy / Valence API (called from main.js) ──

/** Nudge energy by a delta. Clamped to [0,1]. */
export function nudgeEnergy(delta) {
    energy = Math.max(0, Math.min(1, energy + delta));
}

/** Nudge valence by a delta. Clamped to [-1,1]. */
export function nudgeValence(delta) {
    valence = Math.max(-1, Math.min(1, valence + delta));
}

/** Set progress ratio for current level (0–1). Only raises energy, never lowers. */
export function setProgress(ratio) {
    const p = Math.max(0, Math.min(1, ratio));
    const target = 0.25 + p * 0.55; // maps 0–1 to 0.25–0.8
    // Only raise, never drop energy from progress
    if (target > energy) {
        energy = energy * 0.6 + target * 0.4; // faster blend upward
    }
}

/** Burst of triumph energy (decays naturally). */
export function triumphBurst() {
    energy = Math.min(1, energy + 0.45);
    valence = Math.min(1, valence + 0.5);
}

/** Get current state for external checks */
export function getEnergy() { return energy; }
export function getValence() { return valence; }

// Keep backward compat for main.js getMood
export function getMood() {
    if (energy > 0.8 && valence > 0.3) return 'triumph';
    if (valence < -0.2) return 'tense';
    if (energy > 0.4) return 'flowing';
    return 'ambient';
}

// ── Beat Clock ──

function startBeatClock() {
    if (beatTimer) return;
    scheduleBeat();
}

function scheduleBeat() {
    const intervalMs = (60 / bpm) * 1000;
    beatTimer = setTimeout(() => {
        onBeat();
        if (running) scheduleBeat();
    }, intervalMs);
}

function onBeat() {
    if (!ctx || !running) return;

    // Smoothly approach target BPM
    bpm += (targetBpm - bpm) * 0.06;

    // Very slow decay — energy lingers, mood feels persistent
    energy *= 0.9992;
    valence *= 0.9995;
    if (energy < 0.12) energy = 0.12; // never fully silent

    const beatInBar = beat % 4;
    const barInPhrase = Math.floor(beat / 4) % 4;

    // ── Bar boundary (every 4 beats): change chord ──
    if (beatInBar === 0 && currentProg) {
        progIdx = (progIdx + 1) % currentProg.length;
        crossfadeToChord(currentProg[progIdx]);
    }

    // ── Phrase boundary (every 16 beats): maybe swap progression ──
    if (beat % 16 === 0) {
        updateProgression();
        updateTargetBpm();
    }

    // ── Every beat: update layer volumes & filter ──
    updateLayers();

    // ── Play rhythmic layers ──
    playArpBeat(beatInBar);
    if (beatInBar === 0 || beatInBar === 2) playPulseBeat();
    if (beat % 8 === 0) playBellNote();
    if (beat % 6 === 0 && energy > 0.5) playShimmer();

    beat++;
}

// ── Progression Selection ──

function pickProgression() {
    if (energy > 0.8 && valence > 0.3) {
        return TRIUMPH_PROGS[Math.floor(Math.random() * TRIUMPH_PROGS.length)];
    }
    if (valence >= 0) {
        return MAJOR_PROGS[Math.floor(Math.random() * MAJOR_PROGS.length)];
    }
    return MINOR_PROGS[Math.floor(Math.random() * MINOR_PROGS.length)];
}

function updateProgression() {
    const newProg = pickProgression();
    // Only swap if it's actually different
    if (newProg !== currentProg) {
        currentProg = newProg;
        progIdx = 0;
        crossfadeToChord(currentProg[0]);
    }
}

function updateTargetBpm() {
    // BPM scales with energy: 52–112 (dramatic range)
    targetBpm = 52 + energy * 60;
}

// ── Layer Volume Control ──

function updateLayers() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const f = 0.3; // smoothing time constant (faster response)

    // Filter frequency: 400 (muffled calm) → 6000 (bright intense)
    const filterF = 400 + energy * 5600 + Math.max(0, valence) * 1200;
    masterFilter.frequency.setTargetAtTime(filterF, now, f);

    // Pad: always on, volume scales dramatically 0.015–0.09
    const padVol = 0.015 + energy * 0.075;
    padVoices.forEach(v => {
        if (v.gain) v.gain.gain.setTargetAtTime(padVol, now, f);
    });

    // Bass: on at energy > 0.1, scales to 0.08
    if (bassVoice) {
        const bv = energy > 0.1 ? 0.015 + energy * 0.065 : 0;
        bassVoice.gain.gain.setTargetAtTime(bv, now, f);
    }

    // Sub-bass: on at energy > 0.25, rumbles louder
    if (subVoice) {
        const sv = energy > 0.25 ? (energy - 0.25) * 0.06 : 0;
        subVoice.gain.gain.setTargetAtTime(sv, now, f);
    }

    // Strings: on at energy > 0.3, much more present
    const strVol = energy > 0.3 ? (energy - 0.3) * 0.08 : 0;
    stringVoices.forEach(v => {
        if (v.gain) v.gain.gain.setTargetAtTime(strVol, now, f);
    });
}

// ── Chord Crossfade ──

function crossfadeToChord(chord) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const fade = (60 / bpm) * 0.8; // less than one beat for smooth overlap

    // ── Fade out old pad ──
    padVoices.forEach(v => {
        v.gain.gain.setTargetAtTime(0.001, now, fade * 0.5);
        const cleanup = () => {
            try { v.osc.stop(); v.osc.disconnect(); v.gain.disconnect(); } catch {}
            try { if (v.lfo) { v.lfo.stop(); v.lfo.disconnect(); v.lfoGain.disconnect(); } } catch {}
        };
        setTimeout(cleanup, fade * 3000);
    });
    padVoices = [];

    // ── Fade out old bass ──
    if (bassVoice) {
        bassVoice.gain.gain.setTargetAtTime(0.001, now, fade * 0.5);
        const old = bassVoice;
        setTimeout(() => { try { old.osc.stop(); old.osc.disconnect(); old.gain.disconnect(); } catch {} }, fade * 3000);
        bassVoice = null;
    }
    // ── Fade out old sub ──
    if (subVoice) {
        subVoice.gain.gain.setTargetAtTime(0.001, now, fade * 0.5);
        const old = subVoice;
        setTimeout(() => { try { old.osc.stop(); old.osc.disconnect(); old.gain.disconnect(); } catch {} }, fade * 3000);
        subVoice = null;
    }
    // ── Fade out old strings ──
    stringVoices.forEach(v => {
        v.gain.gain.setTargetAtTime(0.001, now, fade * 0.5);
        setTimeout(() => {
            try { v.osc.stop(); v.osc.disconnect(); v.gain.disconnect(); } catch {}
            try { if (v.vibLfo) { v.vibLfo.stop(); v.vibLfo.disconnect(); v.vibGain.disconnect(); } } catch {}
        }, fade * 3000);
    });
    stringVoices = [];

    // ── Build new voices ──
    buildPad(chord, fade);
    buildBass(chord, fade);
    buildSub(chord, fade);
    buildStrings(chord, fade);
}

// ── Layer: Pad (warm detuned sine chord) ──

function buildPad(chord, fadeIn) {
    const now = ctx.currentTime;
    chord.pad.forEach((freq, i) => {
        // Main voice
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.setTargetAtTime(0.04, now, fadeIn);

        // Detune LFO
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 0.04 + i * 0.02;
        lfoGain.gain.value = 2;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);

        osc.connect(gain);
        gain.connect(musicGain);
        lfo.start(now);
        osc.start(now);
        padVoices.push({ osc, gain, lfo, lfoGain });

        // Detuned second voice (chorus effect)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 1.003;
        gain2.gain.setValueAtTime(0.001, now);
        gain2.gain.setTargetAtTime(0.02, now, fadeIn);
        osc2.connect(gain2);
        gain2.connect(musicGain);
        osc2.start(now);
        padVoices.push({ osc: osc2, gain: gain2 });
    });
}

// ── Layer: Bass ──

function buildBass(chord, fadeIn) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = chord.bass;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.setTargetAtTime(0.03, now, fadeIn);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(now);
    bassVoice = { osc, gain };
}

// ── Layer: Sub-bass (octave below bass) ──

function buildSub(chord, fadeIn) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = chord.bass / 2;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.setTargetAtTime(0.015, now, fadeIn);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(now);
    subVoice = { osc, gain };
}

// ── Layer: Strings (high register with vibrato) ──

function buildStrings(chord, fadeIn) {
    const now = ctx.currentTime;
    // Use top 2 notes of pad, up an octave
    const notes = chord.pad.slice(-2).map(f => f * 2);
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.setTargetAtTime(0.015, now, fadeIn);

        // Vibrato LFO
        const vibLfo = ctx.createOscillator();
        const vibGain = ctx.createGain();
        vibLfo.type = 'sine';
        vibLfo.frequency.value = 4.5 + i * 0.5; // ~5Hz vibrato
        vibGain.gain.value = 3; // subtle pitch bend
        vibLfo.connect(vibGain);
        vibGain.connect(osc.detune);

        osc.connect(gain);
        gain.connect(musicGain);
        vibLfo.start(now);
        osc.start(now);
        stringVoices.push({ osc, gain, vibLfo, vibGain });
    });
}

// ── Layer: Arpeggiator (plays on each beat) ──

let arpIdx = 0;

function playArpBeat(beatInBar) {
    if (!ctx || energy < 0.2) return;
    const chord = currentProg ? currentProg[progIdx] : null;
    if (!chord) return;

    const notes = chord.arp;
    // Pattern varies: ascending, descending, alternating based on bar
    const bar = Math.floor(beat / 4) % 4;
    let idx;
    if (bar === 0 || bar === 2) {
        idx = arpIdx % notes.length; // ascending
    } else if (bar === 1) {
        idx = (notes.length - 1 - arpIdx % notes.length); // descending
    } else {
        idx = (arpIdx * 2) % notes.length; // skip pattern
    }
    arpIdx++;

    const freq = notes[idx];
    const vol = 0.005 + energy * 0.06; // whisper at low energy, prominent at high
    playNote(freq, 0.18, 'triangle', vol, musicGain);
}

// ── Layer: Pulse (rhythmic kick on beats 0,2) ──

function playPulseBeat() {
    if (!ctx || energy < 0.5) return;
    const chord = currentProg ? currentProg[progIdx] : null;
    if (!chord) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.value = chord.bass * 4;
    filter.type = 'lowpass';
    filter.frequency.value = 300 + energy * 400;
    filter.Q.value = 4;

    const vol = (energy - 0.45) * 0.06;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    osc.start(now);
    osc.stop(now + 0.08);
}

// ── Layer: FM Bell (every 8 beats) ──

function playBellNote() {
    if (!ctx || energy < 0.35) return;
    const chord = currentProg ? currentProg[progIdx] : null;
    if (!chord) return;

    const notes = chord.arp;
    const freq = notes[Math.floor(Math.random() * 2) + notes.length - 3] || notes[notes.length - 1];
    const now = ctx.currentTime;

    const carrier = ctx.createOscillator();
    const cGain = ctx.createGain();
    const mod = ctx.createOscillator();
    const mGain = ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.value = freq;
    mod.type = 'sine';
    mod.frequency.value = freq * 2.01;
    mGain.gain.value = freq * 0.3;
    mod.connect(mGain);
    mGain.connect(carrier.frequency);

    const vol = (energy - 0.3) * 0.06;
    cGain.gain.setValueAtTime(vol, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    carrier.connect(cGain);
    cGain.connect(musicGain);
    mod.start(now);
    carrier.start(now);
    carrier.stop(now + 1.2);
    mod.stop(now + 1.2);
}

// ── Layer: Shimmer (high octave sparkle, energy > 0.5) ──

function playShimmer() {
    if (!ctx) return;
    const chord = currentProg ? currentProg[progIdx] : null;
    if (!chord) return;

    const notes = chord.arp;
    const freq = notes[notes.length - 1] * 2; // very high
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const vol = (energy - 0.4) * 0.025;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(now);
    osc.stop(now + 2.5);
}

// ── Generic Note Player ──

function playNote(freq, dur, type, vol, dest) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.05);
}

// ── SFX (harmonically locked to current chord) ──

function getChord() {
    return currentProg ? currentProg[progIdx] : C.Cmaj7;
}

function playSfxTone(freq, dur, type, vol) {
    playNote(freq, dur, type, vol, sfxGain);
}

/** Edge drawn — ascending chord tone locked to progress */
export function playEdgeDraw(moveIndex, totalNodes) {
    if (!ensureCtx()) return;
    const ch = getChord();
    const idx = Math.min(moveIndex, ch.arp.length - 1);
    playSfxTone(ch.arp[idx], 0.2, 'sine', 0.22);
    playSfxTone(ch.arp[idx] * 2, 0.1, 'sine', 0.06); // harmonic
}

/** Invalid move — dissonant note */
export function playInvalidMove() {
    if (!ensureCtx()) return;
    const ch = getChord();
    const dis = ch.dis[Math.floor(Math.random() * ch.dis.length)];
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.value = dis;
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(1200, now);
    filt.frequency.exponentialRampToValueAtTime(100, now + 0.2);
    filt.Q.value = 3;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(filt);
    filt.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.28);
}

/** Win — ascending arpeggio through 2 octaves */
export function playWin() {
    if (!ensureCtx()) return;
    const ch = getChord();
    const notes = [...ch.arp, ...ch.arp.map(f => f * 2)];
    notes.forEach((freq, i) => {
        setTimeout(() => playSfxTone(freq, 0.45, 'sine', 0.18), i * 70);
    });
}

/** Undo — descending chord tone glide */
export function playUndo() {
    if (!ensureCtx()) return;
    const ch = getChord();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(ch.arp[3] || ch.arp[2], now);
    osc.frequency.exponentialRampToValueAtTime(ch.arp[0], now + 0.18);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.28);
}

/** Hint — two chord tones */
export function playHint() {
    if (!ensureCtx()) return;
    const ch = getChord();
    const l = ch.arp.length;
    playSfxTone(ch.arp[l - 2], 0.28, 'sine', 0.18);
    setTimeout(() => playSfxTone(ch.arp[l - 1], 0.22, 'sine', 0.15), 70);
}

/** Reset — root descending */
export function playReset() {
    if (!ensureCtx()) return;
    const ch = getChord();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(ch.arp[0] * 2, now);
    osc.frequency.exponentialRampToValueAtTime(ch.arp[0], now + 0.22);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.33);
}

// ── Engine Start / Stop ──

function startEngine() {
    if (running || !ctx) return;
    running = true;
    beat = 0;
    arpIdx = 0;
    currentProg = pickProgression();
    progIdx = 0;
    crossfadeToChord(currentProg[0]);
    startBeatClock();
}

function stopEngine() {
    running = false;
    if (beatTimer) { clearTimeout(beatTimer); beatTimer = null; }

    const now = ctx ? ctx.currentTime : 0;
    const cleanup = (voices) => {
        voices.forEach(v => {
            try { v.gain.gain.setTargetAtTime(0.001, now, 0.3); } catch {}
            setTimeout(() => {
                try { v.osc.stop(); v.osc.disconnect(); v.gain.disconnect(); } catch {}
                try { if (v.lfo) { v.lfo.stop(); v.lfo.disconnect(); } } catch {}
                try { if (v.lfoGain) v.lfoGain.disconnect(); } catch {}
                try { if (v.vibLfo) { v.vibLfo.stop(); v.vibLfo.disconnect(); } } catch {}
                try { if (v.vibGain) v.vibGain.disconnect(); } catch {}
            }, 800);
        });
    };

    cleanup(padVoices);
    cleanup(stringVoices);
    padVoices = [];
    stringVoices = [];

    [bassVoice, subVoice].forEach(v => {
        if (!v) return;
        try { v.gain.gain.setTargetAtTime(0.001, now, 0.3); } catch {}
        setTimeout(() => { try { v.osc.stop(); v.osc.disconnect(); v.gain.disconnect(); } catch {} }, 800);
    });
    bassVoice = null;
    subVoice = null;
}

// Backward compat — these are now no-ops, mood is driven by energy/valence
export function setMood() {}

// ── Debug Info ──

// Reverse lookup: chord object → name
const CHORD_NAMES = new Map();
Object.entries(C).forEach(([name, ch]) => CHORD_NAMES.set(ch, name));

function getProgType() {
    if (!currentProg) return '—';
    if (TRIUMPH_PROGS.includes(currentProg)) return 'TRIUMPH';
    if (MINOR_PROGS.includes(currentProg)) return 'MINOR';
    return 'MAJOR';
}

/** Returns current audio state for debug overlay */
export function getDebugInfo() {
    const ch = currentProg ? currentProg[progIdx] : null;
    const chordName = ch ? (CHORD_NAMES.get(ch) || '?') : '—';
    const progChords = currentProg
        ? currentProg.map((c, i) => (i === progIdx ? `[${CHORD_NAMES.get(c) || '?'}]` : CHORD_NAMES.get(c) || '?')).join(' → ')
        : '—';

    // Active layers
    const layers = [];
    if (padVoices.length > 0) layers.push('pad');
    if (bassVoice) layers.push('bass');
    if (subVoice) layers.push('sub');
    if (stringVoices.length > 0) layers.push('str');
    if (energy >= 0.2) layers.push('arp');
    if (energy >= 0.5) layers.push('pulse');
    if (energy >= 0.35) layers.push('bell');
    if (energy >= 0.5) layers.push('shim');

    return {
        energy: energy.toFixed(3),
        valence: valence.toFixed(3),
        bpm: bpm.toFixed(1),
        beat: beat % 16,
        bar: Math.floor(beat / 4) % 4,
        chord: chordName,
        progType: getProgType(),
        progression: progChords,
        layers: layers.join(' '),
        mood: getMood(),
    };
}
