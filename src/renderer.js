// ═══════════════════════════════════════════════════════════
// Unbroken — Canvas Renderer
// ═══════════════════════════════════════════════════════════

import { CONFIG } from './config.js';
import {
    getShakeOffset, getVertexPulse, drawEffects,
} from './effects.js';

const C = CONFIG.COLORS;
const V = CONFIG.VERTEX;
const E = CONFIG.EDGE;
const NC = CONFIG.NODE_COLORS;

// ── Edge curve computation ──
// Detects edges that pass too close to non-incident nodes and
// curves them outward (away from graph center) as quadratic Béziers.

const CURVE_PROXIMITY_THRESHOLD = 35; // px — if a node is within this distance of a non-incident edge, curve it
const CURVE_BULGE = 0.78;             // how far the control point pushes out (fraction of edge length) — near semi-circle

/**
 * Point-to-segment distance (2D, pixel space).
 */
function ptSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Compute which edges need outward curves and their control points.
 * Returns a Map<edgeKey, {cx, cy}> where cx,cy is the Bézier control point.
 * Call once per level (cached on level object).
 */
function computeEdgeCurves(vertices, graph) {
    const curves = new Map();

    for (const edge of graph.edges) {
        const a = vertices[edge.u];
        const b = vertices[edge.v];
        const key = edge.u < edge.v ? `${edge.u}-${edge.v}` : `${edge.v}-${edge.u}`;

        let needsCurve = false;

        // Check if any non-incident vertex is too close to this edge
        for (let k = 0; k < vertices.length; k++) {
            if (k === edge.u || k === edge.v) continue;
            if (graph.degree(k) === 0) continue;
            const d = ptSegDist(vertices[k].x, vertices[k].y, a.x, a.y, b.x, b.y);
            if (d < CURVE_PROXIMITY_THRESHOLD) {
                needsCurve = true;
                break;
            }
        }

        if (needsCurve) {
            // Compute control point: midpoint of edge, pushed outward from graph center
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;

            // Graph center (average of all vertices)
            let cenX = 0, cenY = 0;
            for (const v of vertices) { cenX += v.x; cenY += v.y; }
            cenX /= vertices.length;
            cenY /= vertices.length;

            // Direction from center toward edge midpoint
            let dirX = mx - cenX;
            let dirY = my - cenY;
            const dirLen = Math.hypot(dirX, dirY);

            if (dirLen > 0.1) {
                dirX /= dirLen;
                dirY /= dirLen;
            } else {
                // Edge and normal perpendicular to it
                const edx = b.x - a.x, edy = b.y - a.y;
                const elen = Math.hypot(edx, edy) || 1;
                dirX = -edy / elen;
                dirY = edx / elen;
            }

            const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
            const bulge = edgeLen * CURVE_BULGE;

            curves.set(key, {
                cx: mx + dirX * bulge,
                cy: my + dirY * bulge,
            });
        }
    }

    return curves;
}

/**
 * Draw an edge path — either straight line or quadratic Bézier curve.
 */
function drawEdgePath(ctx, a, b, curveData) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    if (curveData) {
        ctx.quadraticCurveTo(curveData.cx, curveData.cy, b.x, b.y);
    } else {
        ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
}

/**
 * Get the hex color for a node color index.
 */
function getNodeColor(colorIdx) {
    return NC[colorIdx]?.hex || C.VERTEX_DEFAULT;
}

function getNodeGlow(colorIdx) {
    return NC[colorIdx]?.glow || C.EDGE_DRAWN_GLOW;
}

/**
 * Main rendering function — called every frame during gameplay.
 */
export function renderGame(ctx, canvas, puzzle, hoverVertex, timestamp, highContrast = false) {
    const w = canvas.width;
    const h = canvas.height;

    const shake = getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    drawBackground(ctx, w, h, timestamp);

    if (!puzzle || !puzzle.level) {
        ctx.restore();
        return;
    }

    const level = puzzle.level;
    const vertices = level.vertices;
    const graph = level.graph;

    // Compute edge curves (cached on level object)
    if (!level._edgeCurves) {
        level._edgeCurves = computeEdgeCurves(vertices, graph);
    }
    const edgeCurves = level._edgeCurves;

    // Draw ghost edges
    drawGhostEdges(ctx, vertices, graph, puzzle, level, edgeCurves);

    // Draw completed path edges
    drawDrawnPath(ctx, vertices, puzzle, level, edgeCurves);

    // Draw vertices
    drawVertices(ctx, vertices, graph, puzzle, hoverVertex, timestamp, level, highContrast);

    // Draw effects
    drawEffects(ctx);

    ctx.restore();
}

/**
 * Dark gradient background with subtle grid.
 */
function drawBackground(ctx, w, h, timestamp) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, C.BG_GRADIENT_START);
    grad.addColorStop(1, C.BG_GRADIENT_END);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const spacing = 40;
    const breathe = Math.sin(timestamp * 0.001) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(255,255,255,${0.015 * breathe})`;
    for (let x = spacing; x < w; x += spacing) {
        for (let y = spacing; y < h; y += spacing) {
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

/**
 * Draw ghost edges (target shape). Color-tinted if colors are active.
 */
function drawGhostEdges(ctx, vertices, graph, puzzle, level, edgeCurves) {
    ctx.lineCap = 'round';

    for (const edge of graph.edges) {
        const key = edge.u < edge.v ? `${edge.u}-${edge.v}` : `${edge.v}-${edge.u}`;
        if (puzzle.drawnEdges.has(key)) continue;

        const a = vertices[edge.u];
        const b = vertices[edge.v];

        // Determine edge color based on shared node colors
        if (level.colorCount > 1 && level.nodeColors) {
            const colA = level.nodeColors[edge.u];
            const colB = level.nodeColors[edge.v];
            // Find shared color
            let sharedColor = -1;
            if (colA && colB) {
                for (const c of colA.colors) {
                    if (colB.colors.includes(c)) { sharedColor = c; break; }
                }
            }
            if (sharedColor >= 0) {
                const nc = NC[sharedColor];
                ctx.strokeStyle = nc ? nc.dim : C.EDGE_GHOST;
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.06)'; // incompatible edge — very dim
            }
        } else {
            ctx.strokeStyle = C.EDGE_GHOST;
        }

        ctx.lineWidth = E.GHOST_WIDTH;
        drawEdgePath(ctx, a, b, edgeCurves.get(key));
    }

    // Draw invalid edge feedback
    if (puzzle.invalidEdge) {
        const { from, to } = puzzle.invalidEdge;
        const a = vertices[from];
        const b = vertices[to];
        if (a && b) {
            ctx.strokeStyle = C.EDGE_INVALID;
            ctx.lineWidth = E.DRAWN_WIDTH;
            ctx.globalAlpha = 0.6;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }
    }
}

/**
 * Draw the player's completed path with color.
 */
function drawDrawnPath(ctx, vertices, puzzle, level, edgeCurves) {
    if (puzzle.path.length < 2) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw each edge segment individually (for per-edge coloring)
    for (let i = 0; i < puzzle.path.length - 1; i++) {
        const fromIdx = puzzle.path[i];
        const toIdx = puzzle.path[i + 1];
        const a = vertices[fromIdx];
        const b = vertices[toIdx];

        // Get edge color from the source node
        let edgeColor = C.PATH_STROKE;
        let glowColor = C.PATH_GLOW;

        if (level.colorCount > 1 && level.nodeColors) {
            const fromColors = level.nodeColors[fromIdx];
            const toColors = level.nodeColors[toIdx];
            // Find the shared color
            let sharedColor = 0;
            if (fromColors && toColors) {
                for (const c of fromColors.colors) {
                    if (toColors.colors.includes(c)) { sharedColor = c; break; }
                }
            }
            edgeColor = getNodeColor(sharedColor);
            glowColor = getNodeGlow(sharedColor);
        }

        const edgeKey = fromIdx < toIdx ? `${fromIdx}-${toIdx}` : `${toIdx}-${fromIdx}`;
        const curve = edgeCurves.get(edgeKey);

        // Glow
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = E.GLOW_WIDTH;
        drawEdgePath(ctx, a, b, curve);

        // Main stroke
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = E.DRAWN_WIDTH;
        drawEdgePath(ctx, a, b, curve);
    }
}

/**
 * Draw all vertices with color, state, and bridge rendering.
 */
function drawVertices(ctx, vertices, graph, puzzle, hoverVertex, timestamp, level, highContrast) {
    for (let i = 0; i < vertices.length; i++) {
        if (graph.degree(i) === 0) continue;

        const v = vertices[i];
        const isHover = hoverVertex === i;
        const isCurrent = puzzle.currentVertex === i;
        const isVisited = puzzle.visitedNodes.has(i) && !isCurrent;
        const isStart = puzzle.path.length === 0;
        const isHint = puzzle.hintVertex === i;
        const nodeColor = level.nodeColors?.[i];
        const isBridge = nodeColor?.isBridge || false;

        let radius = V.RADIUS;

        // Pulse animation check
        const pulseData = getVertexPulse(i);
        if (pulseData) {
            const elapsed = Date.now() - pulseData.start;
            const t = elapsed / CONFIG.ANIM.VERTEX_PULSE_DURATION;
            if (t < 1) {
                const ringRadius = V.RING_RADIUS * (1 + t * 1.5);
                ctx.strokeStyle = pulseData.color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 1 - t;
                ctx.beginPath();
                ctx.arc(v.x, v.y, ringRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        // ── State-dependent rendering ──

        if (isHint) {
            // Pulsing hint
            const pulse = Math.sin(timestamp * 0.006) * 0.3 + 0.7;
            radius = V.RADIUS * (1 + pulse * 0.3);
            // Ring
            ctx.strokeStyle = CONFIG.COLORS.STAR_GOLD;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(v.x, v.y, V.RING_RADIUS * (1 + pulse * 0.15), 0, Math.PI * 2);
            ctx.stroke();
            // Fill with gold
            ctx.fillStyle = CONFIG.COLORS.STAR_GOLD;
            ctx.beginPath();
            ctx.arc(v.x, v.y, radius, 0, Math.PI * 2);
            ctx.fill();
        } else if (isVisited) {
            // Visited node — dimmed with X mark
            radius = V.RADIUS * 0.9;
            ctx.globalAlpha = 0.35;
            drawColoredNode(ctx, v, radius, nodeColor, isBridge, level.colorCount, highContrast);
            ctx.globalAlpha = 1;

            // Small X mark
            const xr = radius * 0.4;
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(v.x - xr, v.y - xr);
            ctx.lineTo(v.x + xr, v.y + xr);
            ctx.moveTo(v.x + xr, v.y - xr);
            ctx.lineTo(v.x - xr, v.y + xr);
            ctx.stroke();
        } else if (isCurrent) {
            // Current node — pulsing ring + bright
            radius = V.RADIUS * 1.25;
            const ringPulse = Math.sin(timestamp * 0.004) * 0.12 + 1;
            ctx.strokeStyle = C.VERTEX_CURRENT;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(v.x, v.y, V.RING_RADIUS * ringPulse, 0, Math.PI * 2);
            ctx.stroke();
            drawColoredNode(ctx, v, radius, nodeColor, isBridge, level.colorCount, highContrast);
        } else if (isStart) {
            // All nodes glow as potential starts
            radius = V.RADIUS * (1 + Math.sin(timestamp * 0.004) * 0.08);
            ctx.strokeStyle = C.VERTEX_RING;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(v.x, v.y, V.RING_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
            drawColoredNode(ctx, v, radius, nodeColor, isBridge, level.colorCount, highContrast);
        } else if (isHover) {
            radius = V.RADIUS * V.HOVER_SCALE;
            ctx.strokeStyle = C.VERTEX_HOVER;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(v.x, v.y, V.RING_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
            drawColoredNode(ctx, v, radius, nodeColor, isBridge, level.colorCount, highContrast);
        } else {
            // Default
            drawColoredNode(ctx, v, radius, nodeColor, isBridge, level.colorCount, highContrast);
        }

        // Inner highlight (glass effect)
        if (!isVisited) {
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.arc(v.x - radius * 0.2, v.y - radius * 0.25, radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

/**
 * Draw a node with its assigned color(s).
 * Bridge nodes = split circle (left half = color A, right half = color B).
 * In high-contrast mode, uses distinct geometric shapes per color.
 */
function drawColoredNode(ctx, pos, radius, nodeColorData, isBridge, colorCount, highContrast = false) {
    if (!nodeColorData || colorCount <= 1) {
        // Single color or no color mechanic — use default teal
        if (highContrast) {
            drawShape(ctx, pos, radius, 'circle', C.VERTEX_START);
        } else {
            ctx.fillStyle = C.VERTEX_START;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        return;
    }

    const colors = nodeColorData.colors;

    if (isBridge && colors.length >= 2) {
        if (highContrast) {
            // Draw first shape slightly left, second slightly right
            const off = radius * 0.45;
            const smallR = radius * 0.7;
            drawShape(ctx, { x: pos.x - off, y: pos.y }, smallR, getShapeForColor(colors[0]), getNodeColor(colors[0]));
            drawShape(ctx, { x: pos.x + off, y: pos.y }, smallR, getShapeForColor(colors[1]), getNodeColor(colors[1]));
            // Dividing line
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y - radius);
            ctx.lineTo(pos.x, pos.y + radius);
            ctx.stroke();
        } else {
            // Split circle: left half = first color, right half = second color
            ctx.fillStyle = getNodeColor(colors[0]);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, Math.PI * 0.5, Math.PI * 1.5);
            ctx.fill();

            ctx.fillStyle = getNodeColor(colors[1]);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, Math.PI * 1.5, Math.PI * 0.5);
            ctx.fill();

            // Dividing line
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y - radius);
            ctx.lineTo(pos.x, pos.y + radius);
            ctx.stroke();
        }
    } else {
        // Single color node
        if (highContrast) {
            drawShape(ctx, pos, radius, getShapeForColor(colors[0]), getNodeColor(colors[0]));
        } else {
            ctx.fillStyle = getNodeColor(colors[0]);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// ── High-Contrast Shape Helpers ──

function getShapeForColor(colorIdx) {
    return CONFIG.HIGH_CONTRAST_SHAPES[colorIdx] || 'circle';
}

function drawShape(ctx, pos, radius, shape, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;

    switch (shape) {
        case 'circle':
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
        case 'diamond':
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y - radius * 1.2);
            ctx.lineTo(pos.x + radius, pos.y);
            ctx.lineTo(pos.x, pos.y + radius * 1.2);
            ctx.lineTo(pos.x - radius, pos.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case 'star': {
            const spikes = 5;
            const outerR = radius * 1.15;
            const innerR = radius * 0.5;
            ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const r = i % 2 === 0 ? outerR : innerR;
                const angle = (Math.PI / 2 * -1) + (i * Math.PI / spikes);
                const method = i === 0 ? 'moveTo' : 'lineTo';
                ctx[method](pos.x + Math.cos(angle) * r, pos.y + Math.sin(angle) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'triangle':
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y - radius * 1.15);
            ctx.lineTo(pos.x + radius * 1.05, pos.y + radius * 0.7);
            ctx.lineTo(pos.x - radius * 1.05, pos.y + radius * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case 'square':
            ctx.beginPath();
            ctx.rect(pos.x - radius * 0.85, pos.y - radius * 0.85, radius * 1.7, radius * 1.7);
            ctx.fill();
            ctx.stroke();
            break;
        case 'hexagon':
            drawRegularPolygon(ctx, pos, radius, 6);
            break;
        case 'pentagon':
            drawRegularPolygon(ctx, pos, radius, 5);
            break;
        case 'cross': {
            const a = radius * 0.4;
            const b = radius * 1.1;
            ctx.beginPath();
            ctx.moveTo(pos.x - a, pos.y - b);
            ctx.lineTo(pos.x + a, pos.y - b);
            ctx.lineTo(pos.x + a, pos.y - a);
            ctx.lineTo(pos.x + b, pos.y - a);
            ctx.lineTo(pos.x + b, pos.y + a);
            ctx.lineTo(pos.x + a, pos.y + a);
            ctx.lineTo(pos.x + a, pos.y + b);
            ctx.lineTo(pos.x - a, pos.y + b);
            ctx.lineTo(pos.x - a, pos.y + a);
            ctx.lineTo(pos.x - b, pos.y + a);
            ctx.lineTo(pos.x - b, pos.y - a);
            ctx.lineTo(pos.x - a, pos.y - a);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'heart': {
            const r = radius * 0.6;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y + radius * 0.9);
            ctx.bezierCurveTo(pos.x - radius * 1.4, pos.y, pos.x - radius * 0.7, pos.y - radius * 1.2, pos.x, pos.y - radius * 0.4);
            ctx.bezierCurveTo(pos.x + radius * 0.7, pos.y - radius * 1.2, pos.x + radius * 1.4, pos.y, pos.x, pos.y + radius * 0.9);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        }
        case 'arrow': {
            const w = radius * 0.5;
            const h = radius * 1.1;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y - h);
            ctx.lineTo(pos.x + radius, pos.y);
            ctx.lineTo(pos.x + w, pos.y);
            ctx.lineTo(pos.x + w, pos.y + h);
            ctx.lineTo(pos.x - w, pos.y + h);
            ctx.lineTo(pos.x - w, pos.y);
            ctx.lineTo(pos.x - radius, pos.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        }
        default:
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
    }
}

function drawRegularPolygon(ctx, pos, radius, sides) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = (Math.PI / 2 * -1) + (i * 2 * Math.PI / sides);
        const method = i === 0 ? 'moveTo' : 'lineTo';
        ctx[method](pos.x + Math.cos(angle) * radius, pos.y + Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

/**
 * Render a level thumbnail for level select.
 */
export function renderThumbnail(ctx, level, x, y, size) {
    const padding = 8;
    const drawSize = size - padding * 2;
    const scale = drawSize / 2;
    const cx = x + size / 2;
    const cy = y + size / 2;

    // Ghost edges
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';

    for (const edge of level.graph.edges) {
        const a = level.unitVertices[edge.u];
        const b = level.unitVertices[edge.v];
        ctx.beginPath();
        ctx.moveTo(cx + a.x * scale, cy + a.y * scale);
        ctx.lineTo(cx + b.x * scale, cy + b.y * scale);
        ctx.stroke();
    }

    // Vertices — colored
    for (let i = 0; i < level.unitVertices.length; i++) {
        if (level.graph.degree(i) === 0) continue;
        const v = level.unitVertices[i];
        const nc = level.nodeColors?.[i];

        if (nc && level.colorCount > 1) {
            ctx.fillStyle = getNodeColor(nc.colors[0]);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
        }

        ctx.beginPath();
        ctx.arc(cx + v.x * scale, cy + v.y * scale, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
}
