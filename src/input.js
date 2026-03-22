// ═══════════════════════════════════════════════════════════
// Unbroken — Input Handler
// ═══════════════════════════════════════════════════════════

import { CONFIG } from './config.js';

const HIT = CONFIG.VERTEX.HIT_RADIUS;

let canvas = null;
let onVertexClick = null;
let onVertexHover = null;
let currentVertices = [];

/**
 * Initialize input handling on the canvas.
 */
export function initInput(canvasEl, callbacks) {
    canvas = canvasEl;
    onVertexClick = callbacks.onVertexClick || (() => {});
    onVertexHover = callbacks.onVertexHover || (() => {});

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    // Touch support
    canvas.addEventListener('touchstart', handleTouch, { passive: false });
}

/**
 * Update the vertex positions for hit detection.
 */
export function updateInputVertices(vertices) {
    currentVertices = vertices || [];
}

/**
 * Get canvas-relative coordinates from a mouse/touch event.
 */
function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    // Vertices are positioned in CSS-space (not buffer-space),
    // so use CSS coordinates directly
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
    };
}

/**
 * Find the closest vertex within hit radius.
 */
function hitTestVertex(pos) {
    let closestIdx = -1;
    let closestDist = HIT;

    for (let i = 0; i < currentVertices.length; i++) {
        const v = currentVertices[i];
        const dx = v.x - pos.x;
        const dy = v.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
        }
    }

    return closestIdx;
}

function handleClick(e) {
    const pos = getCanvasPos(e);
    const idx = hitTestVertex(pos);
    if (idx >= 0) {
        onVertexClick(idx);
    }
}

function handleMouseMove(e) {
    const pos = getCanvasPos(e);
    const idx = hitTestVertex(pos);
    onVertexHover(idx);

    // Set cursor style
    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
}

function handleMouseLeave() {
    onVertexHover(-1);
    canvas.style.cursor = 'default';
}

function handleTouch(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
        const touch = e.touches[0];
        const pos = getCanvasPos(touch);
        const idx = hitTestVertex(pos);
        if (idx >= 0) {
            onVertexClick(idx);
        }
    }
}

/**
 * Cleanup input listeners.
 */
export function destroyInput() {
    if (canvas) {
        canvas.removeEventListener('click', handleClick);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
        canvas.removeEventListener('touchstart', handleTouch);
    }
}
