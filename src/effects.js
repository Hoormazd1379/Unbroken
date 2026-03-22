// ═══════════════════════════════════════════════════════════
// Unbroken — Effects & Animations
// ═══════════════════════════════════════════════════════════

import { CONFIG } from './config.js';

// ── Particle System ──
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = (Math.random() - 0.5) * CONFIG.ANIM.PARTICLE_SPEED * 2;
        this.vy = (Math.random() - 0.5) * CONFIG.ANIM.PARTICLE_SPEED * 2;
        this.life = 1.0;
        this.decay = 1.0 / (CONFIG.ANIM.PARTICLE_LIFETIME / 16);
        this.radius = 2 + Math.random() * 3;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.02; // slight gravity
        this.vx *= 0.99;
        this.life -= this.decay;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.globalAlpha = this.life * 0.8;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * this.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// Active particles
let particles = [];

// Active line animations
let lineAnimations = [];

// Screen shake
let shakeAmount = 0;
let shakeDuration = 0;
let shakeStart = 0;

// Vertex pulse
let pulsingVertices = new Map(); // vertexIdx → {start, color}

/**
 * Spawn celebration particles at a position.
 */
export function spawnParticles(x, y, count = CONFIG.ANIM.PARTICLE_COUNT) {
    const colors = CONFIG.COLORS.PARTICLE_COLORS;
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(
            x, y,
            colors[Math.floor(Math.random() * colors.length)]
        ));
    }
}

/**
 * Spawn particles along all edges for win celebration.
 */
export function spawnWinParticles(vertices, edges) {
    for (const edge of edges) {
        const a = vertices[edge.u];
        const b = vertices[edge.v];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        spawnParticles(mx, my, 5);
    }
    // Extra burst at center
    if (vertices.length > 0) {
        let cx = 0, cy = 0;
        for (const v of vertices) { cx += v.x; cy += v.y; }
        cx /= vertices.length;
        cy /= vertices.length;
        spawnParticles(cx, cy, 20);
    }
}

/**
 * Add a line drawing animation.
 */
export function animateLine(fromX, fromY, toX, toY, duration = CONFIG.ANIM.LINE_DRAW_DURATION) {
    lineAnimations.push({
        fromX, fromY, toX, toY,
        start: Date.now(),
        duration,
        progress: 0,
    });
}

/**
 * Trigger screen shake.
 */
export function screenShake(amount = 3, duration = 200) {
    shakeAmount = amount;
    shakeDuration = duration;
    shakeStart = Date.now();
}

/**
 * Pulse a vertex with color.
 */
export function pulseVertex(index, color = CONFIG.COLORS.VERTEX_ACTIVE) {
    pulsingVertices.set(index, { start: Date.now(), color });
}

/**
 * Update all effects.
 */
export function updateEffects() {
    // Update particles
    particles = particles.filter(p => {
        p.update();
        return p.life > 0;
    });

    // Update line animations
    const now = Date.now();
    lineAnimations = lineAnimations.filter(anim => {
        anim.progress = Math.min(1, (now - anim.start) / anim.duration);
        return anim.progress < 1;
    });

    // Update shake
    if (shakeDuration > 0) {
        const elapsed = now - shakeStart;
        if (elapsed > shakeDuration) {
            shakeDuration = 0;
            shakeAmount = 0;
        }
    }

    // Clean old pulses
    for (const [idx, pulse] of pulsingVertices) {
        if (now - pulse.start > CONFIG.ANIM.VERTEX_PULSE_DURATION) {
            pulsingVertices.delete(idx);
        }
    }
}

/**
 * Draw all effects on canvas.
 */
export function drawEffects(ctx) {
    // Draw particles
    for (const p of particles) {
        p.draw(ctx);
    }

    // Draw animating lines  
    for (const anim of lineAnimations) {
        const t = easeOutCubic(anim.progress);
        const x = anim.fromX + (anim.toX - anim.fromX) * t;
        const y = anim.fromY + (anim.toY - anim.fromY) * t;

        ctx.strokeStyle = CONFIG.COLORS.PATH_STROKE;
        ctx.lineWidth = CONFIG.EDGE.DRAWN_WIDTH;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(anim.fromX, anim.fromY);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
}

/**
 * Get current screen shake offset.
 */
export function getShakeOffset() {
    if (shakeDuration <= 0) return { x: 0, y: 0 };
    const elapsed = Date.now() - shakeStart;
    const decay = 1 - elapsed / shakeDuration;
    return {
        x: (Math.random() - 0.5) * shakeAmount * 2 * decay,
        y: (Math.random() - 0.5) * shakeAmount * 2 * decay,
    };
}

/**
 * Get pulse data for a vertex, or null.
 */
export function getVertexPulse(index) {
    return pulsingVertices.get(index) || null;
}

/**
 * Check if there are active animations.
 */
export function hasActiveEffects() {
    return particles.length > 0 || lineAnimations.length > 0 || shakeDuration > 0;
}

/**
 * Clear all effects.
 */
export function clearEffects() {
    particles = [];
    lineAnimations = [];
    shakeDuration = 0;
    shakeAmount = 0;
    pulsingVertices.clear();
}

// ── Easing functions ──
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
