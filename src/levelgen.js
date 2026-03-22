// ═══════════════════════════════════════════════════════════
// Unbroken — Level Generator
// ═══════════════════════════════════════════════════════════
//
// Pipeline:
//   1→ Determine params (nodes, colors, trap counts)
//   2→ Generate solution Hamiltonian path
//   3→ Place nodes randomly
//   4→ Force-relax layout (Fruchterman-Reingold)
//   5→ Quality check (node spacing, node-edge clearance, crossings)
//   6→ Assign colors with bridge nodes
//   7→ Engineer traps:
//      a) Dead-end forks (spur branches)
//      b) Cycle injection (shortcut loops)
//      c) Articulation point traps (bottlenecks)
//      d) Decoy paths (misleading alternatives)
//      e) Color bottleneck traps
//      f) Parity traps (advanced)
//   8→ Validate solution still works
//   9→ Project to canvas
// ═══════════════════════════════════════════════════════════

import { CONFIG } from './config.js';
import { hashLevel, createRNG } from './rng.js';
import { Graph } from './graph.js';

// ════════════════════════════════════════════════════════════
// Parameters from difficulty
// ════════════════════════════════════════════════════════════

function getDifficulty(level) {
    let diff = 0, prev = 0;
    for (const band of CONFIG.DIFFICULTY.BANDS) {
        if (level <= band.upTo) {
            diff = band.base + (level - prev - 1) * band.rate;
            break;
        }
        prev = band.upTo;
    }
    return Math.max(1, diff);
}

function getColorCount(level) {
    const cm = CONFIG.COLOR_MECHANIC;
    if (level < cm.TWO_COLORS_AT) return 1;
    if (level < cm.THREE_COLORS_AT) return 2;
    if (level < cm.FOUR_COLORS_AT) return 3;
    if (level < cm.FIVE_COLORS_AT) return 4;
    if (level < cm.SIX_COLORS_AT) return 5;
    if (level < cm.SEVEN_PLUS_AT) return 6;
    return Math.min(10, 7 + Math.floor((level - cm.SEVEN_PLUS_AT) / 30));
}

function getNodeCount(difficulty) {
    const d = CONFIG.DIFFICULTY;
    return Math.min(d.MAX_NODES, Math.max(d.MIN_NODES, Math.floor(d.MIN_NODES + difficulty * d.NODE_SCALE)));
}

function getDeadEndCount(level) {
    const T = CONFIG.TRAPS;
    if (level < T.DEAD_END_FORK_START) return 0;
    return Math.floor((level - T.DEAD_END_FORK_START) / T.DEAD_END_FORK_INTERVAL) + 1;
}

function getCycleCount(level) {
    const T = CONFIG.TRAPS;
    if (level < T.CYCLE_START) return 0;
    return Math.floor((level - T.CYCLE_START) / T.CYCLE_INTERVAL) + 1;
}

function getDecoyCount(level) {
    if (level <= 3) return 0;
    if (level <= 7) return 1;
    if (level <= 15) return 2;
    if (level <= 40) return 3;
    return CONFIG.TRAPS.DECOY_MAX_COUNT;
}

// ════════════════════════════════════════════════════════════
// Geometry helpers
// ════════════════════════════════════════════════════════════

function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Minimum distance from point P to line segment AB */
function pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-10) return dist(p, a);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Check if two line segments (a1→a2) and (b1→b2) cross */
function segmentsCross(a1, a2, b1, b2) {
    const d1 = cross(b1, b2, a1);
    const d2 = cross(b1, b2, a2);
    const d3 = cross(a1, a2, b1);
    const d4 = cross(a1, a2, b2);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return false;
}

function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// ════════════════════════════════════════════════════════════
// Node placement + Force-Relaxation Layout
// ════════════════════════════════════════════════════════════

function placeNodesRandom(rng, count) {
    const minDist = CONFIG.LAYOUT.MIN_VERTEX_DISTANCE;
    const nodes = [];
    let attempts = 0;
    while (nodes.length < count && attempts < count * 400) {
        const x = rng.nextFloat() * 1.5 - 0.75;
        const y = rng.nextFloat() * 1.5 - 0.75;
        attempts++;
        let ok = true;
        for (const n of nodes) {
            if (dist({ x, y }, n) < minDist) { ok = false; break; }
        }
        if (ok) nodes.push({ x, y });
    }
    return nodes;
}

/**
 * Fruchterman-Reingold force-directed relaxation.
 * Uses CIRCULAR containment + center gravity to prevent nodes
 * from clustering on the perimeter of a square.
 */
function forceRelax(nodes, solutionPath) {
    const L = CONFIG.LAYOUT;
    const n = nodes.length;
    const vx = new Float64Array(n);
    const vy = new Float64Array(n);
    const idealDist = L.MIN_VERTEX_DISTANCE * 1.6;
    // Scale circular boundary with node count — more nodes → bigger circle
    const boundaryRadius = Math.min(0.92, 0.45 + n * 0.02);
    const gravityStrength = 0.002; // gentle pull toward center

    for (let iter = 0; iter < L.FORCE_ITERATIONS; iter++) {
        const temp = 0.12 * (1 - iter / L.FORCE_ITERATIONS); // cooling

        // Repulsion between all pairs
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                let dx = nodes[i].x - nodes[j].x;
                let dy = nodes[i].y - nodes[j].y;
                let d = Math.sqrt(dx * dx + dy * dy);
                if (d < 0.001) { dx = 0.01; dy = 0.01; d = 0.015; }
                const force = L.FORCE_REPULSION * idealDist * idealDist / d;
                const fx = (dx / d) * force;
                const fy = (dy / d) * force;
                vx[i] += fx; vy[i] += fy;
                vx[j] -= fx; vy[j] -= fy;
            }
        }

        // Attraction along solution path edges (springs)
        for (let k = 0; k < solutionPath.length - 1; k++) {
            const i = solutionPath[k], j = solutionPath[k + 1];
            let dx = nodes[j].x - nodes[i].x;
            let dy = nodes[j].y - nodes[i].y;
            let d = Math.sqrt(dx * dx + dy * dy);
            if (d < 0.001) continue;
            const force = L.FORCE_ATTRACTION * (d - idealDist);
            const fx = (dx / d) * force;
            const fy = (dy / d) * force;
            vx[i] += fx; vy[i] += fy;
            vx[j] -= fx; vy[j] -= fy;
        }

        // Center gravity — gently pull nodes toward origin
        for (let i = 0; i < n; i++) {
            vx[i] -= nodes[i].x * gravityStrength;
            vy[i] -= nodes[i].y * gravityStrength;
        }

        // Apply velocities with damping + CIRCULAR containment
        for (let i = 0; i < n; i++) {
            const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
            if (speed > temp) {
                vx[i] = (vx[i] / speed) * temp;
                vy[i] = (vy[i] / speed) * temp;
            }
            nodes[i].x += vx[i];
            nodes[i].y += vy[i];

            // Circular boundary containment
            const r = Math.sqrt(nodes[i].x * nodes[i].x + nodes[i].y * nodes[i].y);
            if (r > boundaryRadius) {
                nodes[i].x *= boundaryRadius / r;
                nodes[i].y *= boundaryRadius / r;
            }

            vx[i] *= L.FORCE_DAMPING;
            vy[i] *= L.FORCE_DAMPING;
        }
    }

    return nodes;
}

// ════════════════════════════════════════════════════════════
// Layout Quality Checks
// ════════════════════════════════════════════════════════════

function checkNodeSpacing(nodes) {
    const minDist = CONFIG.LAYOUT.MIN_VERTEX_DISTANCE * 0.85;
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            if (dist(nodes[i], nodes[j]) < minDist) return false;
        }
    }
    return true;
}

/** Check that no node is too close to any non-incident edge */
function checkNodeEdgeClearance(nodes, graph) {
    const minClear = CONFIG.LAYOUT.MIN_NODE_EDGE_DISTANCE;
    const edges = graph.edges;
    for (let v = 0; v < nodes.length; v++) {
        for (const e of edges) {
            // Skip edges incident to this node
            if (e.u === v || e.v === v) continue;
            const d = pointToSegmentDist(nodes[v], nodes[e.u], nodes[e.v]);
            if (d < minClear) return false;
        }
    }
    return true;
}

/** Count edge crossings */
function countEdgeCrossings(nodes, graph) {
    const edges = graph.edges;
    let crossings = 0;
    for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
            const ei = edges[i], ej = edges[j];
            // Skip if they share a vertex
            if (ei.u === ej.u || ei.u === ej.v || ei.v === ej.u || ei.v === ej.v) continue;
            if (segmentsCross(nodes[ei.u], nodes[ei.v], nodes[ej.u], nodes[ej.v])) {
                crossings++;
            }
        }
    }
    return crossings;
}

function qualityCheck(nodes, graph) {
    if (!checkNodeSpacing(nodes)) return false;
    if (!checkNodeEdgeClearance(nodes, graph)) return false;
    if (countEdgeCrossings(nodes, graph) > CONFIG.LAYOUT.MAX_EDGE_CROSSINGS) return false;
    return true;
}

// ════════════════════════════════════════════════════════════
// Hamiltonian Path Generation
// ════════════════════════════════════════════════════════════

function generateHamiltonianPath(rng, nodeCount) {
    const path = [];
    for (let i = 0; i < nodeCount; i++) path.push(i);
    rng.shuffle(path);
    return path;
}

// ════════════════════════════════════════════════════════════
// Color Assignment
// ════════════════════════════════════════════════════════════

function areColorCompatible(colorsA, colorsB) {
    if (!colorsA || !colorsB) return true;
    for (const c of colorsA.colors) {
        if (colorsB.colors.includes(c)) return true;
    }
    return false;
}

function assignColors(rng, path, colorCount) {
    const n = path.length;
    const nodeColors = new Array(n);

    if (colorCount <= 1) {
        for (let i = 0; i < n; i++) nodeColors[path[i]] = { colors: [0], isBridge: false };
        return nodeColors;
    }

    const cm = CONFIG.COLOR_MECHANIC;
    const segments = [];
    let remaining = n, colorIdx = 0;

    while (remaining > 0 && colorIdx < colorCount) {
        const isLast = (colorIdx === colorCount - 1);
        let segSize;
        if (isLast) {
            segSize = remaining;
        } else {
            const min = Math.max(cm.MIN_SEGMENT_SIZE, 2);
            const max = Math.min(cm.MAX_SEGMENT_SIZE, remaining - (colorCount - colorIdx - 1) * cm.MIN_SEGMENT_SIZE);
            segSize = rng.nextInt(min, Math.max(min, max));
        }
        segments.push({ color: colorIdx, size: segSize });
        remaining -= segSize;
        colorIdx++;
    }

    let pathIdx = 0;
    for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        for (let i = 0; i < seg.size; i++) {
            const idx = path[pathIdx];
            const isLastInSeg = (i === seg.size - 1) && (s < segments.length - 1);
            if (isLastInSeg) {
                nodeColors[idx] = { colors: [seg.color, segments[s + 1].color], isBridge: true };
            } else {
                nodeColors[idx] = { colors: [seg.color], isBridge: false };
            }
            pathIdx++;
        }
    }
    return nodeColors;
}

// ════════════════════════════════════════════════════════════
// TRAP 1: Dead-End Fork
// ════════════════════════════════════════════════════════════
// Add a short spur off a mid-path node. Player enters the spur,
// visits the dead-end, then can't continue (Hamiltonian constraint).

function addDeadEndForks(rng, solutionPath, graph, nodeColors, count) {
    if (count <= 0) return;
    const n = solutionPath.length;
    let added = 0;

    for (let attempt = 0; attempt < count * 8 && added < count; attempt++) {
        // Pick a node from the middle of the path (not first or last 2)
        const pathPos = rng.nextInt(2, n - 3);
        const forkNode = solutionPath[pathPos];

        // Find an unvisited-adjacent node to branch to
        // The spur leads to a node that's NOT adjacent to the fork node in the solution
        const solPrev = solutionPath[pathPos - 1];
        const solNext = solutionPath[pathPos + 1];

        // Pick another node further along the path as the dead-end target
        const targetPos = rng.nextInt(pathPos + 2, Math.min(n - 1, pathPos + 4));
        const deadEnd = solutionPath[targetPos];

        // Don't add if edge already exists
        if (graph.hasEdge(forkNode, deadEnd)) continue;

        // Check color compatibility
        if (nodeColors && nodeColors[forkNode] && nodeColors[deadEnd]) {
            if (!areColorCompatible(nodeColors[forkNode], nodeColors[deadEnd])) continue;
        }

        graph.addEdge(forkNode, deadEnd);
        added++;
    }
}

// ════════════════════════════════════════════════════════════
// TRAP 2: Cycle/Loop Injection
// ════════════════════════════════════════════════════════════
// Add shortcut edges between nodes 2-3 apart on the solution.
// If the player takes the shortcut, they skip a node and get stuck.

function addCycleTraps(rng, solutionPath, graph, nodeColors, count) {
    if (count <= 0) return;
    const n = solutionPath.length;
    let added = 0;

    for (let attempt = 0; attempt < count * 10 && added < count; attempt++) {
        // Pick two nodes that are 2-3 steps apart on the solution path
        const skip = rng.nextInt(2, 3);
        const pos = rng.nextInt(0, n - skip - 1);
        const a = solutionPath[pos];
        const b = solutionPath[pos + skip];

        if (graph.hasEdge(a, b)) continue;
        if (nodeColors && nodeColors[a] && nodeColors[b]) {
            if (!areColorCompatible(nodeColors[a], nodeColors[b])) continue;
        }

        graph.addEdge(a, b);
        added++;
    }
}

// ════════════════════════════════════════════════════════════
// TRAP 3: Articulation Point Traps
// ════════════════════════════════════════════════════════════
// Create or enhance bottleneck nodes by adding edges that make
// certain nodes the ONLY path between two graph regions.
// Uses DFS-based articulation point detection.

function findArticulationPoints(graph) {
    const n = graph.vertexCount;
    const visited = new Array(n).fill(false);
    const disc = new Array(n).fill(0);
    const low = new Array(n).fill(0);
    const parent = new Array(n).fill(-1);
    const ap = new Set();
    let timer = 0;

    function dfs(u) {
        visited[u] = true;
        disc[u] = low[u] = timer++;
        let children = 0;

        for (const v of graph.neighbors(u)) {
            if (!visited[v]) {
                children++;
                parent[v] = u;
                dfs(v);
                low[u] = Math.min(low[u], low[v]);

                if (parent[u] === -1 && children > 1) ap.add(u);
                if (parent[u] !== -1 && low[v] >= disc[u]) ap.add(u);
            } else if (v !== parent[u]) {
                low[u] = Math.min(low[u], disc[v]);
            }
        }
    }

    for (let i = 0; i < n; i++) {
        if (!visited[i]) dfs(i);
    }
    return ap;
}

function addArticulationTraps(rng, solutionPath, graph, nodeColors, level) {
    if (level < CONFIG.TRAPS.ARTICULATION_START_LEVEL) return;

    const n = solutionPath.length;
    if (n < 6) return;

    // Find existing articulation points
    const aps = findArticulationPoints(graph);

    // If we already have articulation points, strengthen traps around them
    // by adding distractor edges in the regions they bridge
    for (const ap of aps) {
        const neighbors = graph.neighbors(ap);
        if (neighbors.length < 3) continue;

        // Add a distractor edge between two neighbors that are in different
        // regions (separated by the articulation point)
        for (let i = 0; i < neighbors.length - 1 && i < 2; i++) {
            const a = neighbors[i];
            const b = neighbors[i + 1];
            if (a === b || graph.hasEdge(a, b)) continue;
            if (nodeColors && nodeColors[a] && nodeColors[b]) {
                if (!areColorCompatible(nodeColors[a], nodeColors[b])) continue;
            }
            graph.addEdge(a, b);
            break;
        }
    }

    // If no natural APs, try to create one by making a node the only connection
    // between two halves of the solution
    if (aps.size === 0 && n >= 8) {
        const midPos = Math.floor(n / 2);
        const bottleneck = solutionPath[midPos];

        // Add edges within each half but NOT crossing the bottleneck
        const leftNode = solutionPath[rng.nextInt(1, midPos - 1)];
        const rightNode = solutionPath[rng.nextInt(midPos + 1, n - 2)];

        // Connect left nodes to bottleneck's left neighbor
        if (!graph.hasEdge(leftNode, bottleneck)) {
            if (!nodeColors || areColorCompatible(nodeColors[leftNode], nodeColors[bottleneck])) {
                graph.addEdge(leftNode, bottleneck);
            }
        }
        if (!graph.hasEdge(rightNode, bottleneck)) {
            if (!nodeColors || areColorCompatible(nodeColors[rightNode], nodeColors[bottleneck])) {
                graph.addEdge(rightNode, bottleneck);
            }
        }
    }
}

// ════════════════════════════════════════════════════════════
// TRAP 4: Decoy Paths
// ════════════════════════════════════════════════════════════

function addDecoyPaths(rng, solutionPath, graph, nodeColors, count) {
    const n = solutionPath.length;
    if (n < 4 || count <= 0) return;

    const usedPoints = new Set();

    for (let d = 0; d < count; d++) {
        let divergeIdx, attempts = 0;
        do {
            const section = d / Math.max(1, count);
            const start = Math.max(1, Math.floor(section * (n - 2)));
            const end = Math.min(n - 2, start + Math.max(3, Math.floor(n / count)));
            divergeIdx = rng.nextInt(start, end);
            attempts++;
        } while (usedPoints.has(divergeIdx) && attempts < 20);
        usedPoints.add(divergeIdx);

        // Build decoy from divergence point
        const decoy = solutionPath.slice(0, divergeIdx);
        const visited = new Set(decoy);
        const solNext = solutionPath[divergeIdx];
        const lastNode = decoy[decoy.length - 1];

        // Find alternative next node
        const candidates = [];
        for (let i = 0; i < n; i++) {
            if (visited.has(i) || i === solNext) continue;
            if (nodeColors && nodeColors[lastNode] && nodeColors[i]) {
                if (!areColorCompatible(nodeColors[lastNode], nodeColors[i])) continue;
            }
            candidates.push(i);
        }
        if (candidates.length === 0) continue;

        rng.shuffle(candidates);
        const next = candidates[0];

        if (!graph.hasEdge(lastNode, next)) {
            graph.addEdge(lastNode, next);
        }

        // Continue decoy for a few steps
        let curr = next;
        visited.add(curr);
        const steps = Math.min(CONFIG.TRAPS.DECOY_MIN_LENGTH + Math.floor(rng.nextFloat() * 3), n - divergeIdx - 1);

        for (let s = 0; s < steps; s++) {
            const nextCands = [];
            for (let i = 0; i < n; i++) {
                if (visited.has(i)) continue;
                if (nodeColors && nodeColors[curr] && nodeColors[i]) {
                    if (!areColorCompatible(nodeColors[curr], nodeColors[i])) continue;
                }
                nextCands.push(i);
            }
            if (nextCands.length === 0) break;
            rng.shuffle(nextCands);
            const nx = nextCands[0];
            if (!graph.hasEdge(curr, nx)) graph.addEdge(curr, nx);
            visited.add(nx);
            curr = nx;
        }
    }
}

// ════════════════════════════════════════════════════════════
// TRAP 5: Color Bottleneck
// ════════════════════════════════════════════════════════════

function addColorBottlenecks(rng, solutionPath, nodeColors, graph, colorCount) {
    if (colorCount <= 1) return;

    const n = solutionPath.length;
    // Find real bridges (exactly 1 per color pair on the solution)
    const bridgePairs = new Map(); // "a-b" → nodeIdx

    for (let i = 0; i < n; i++) {
        if (nodeColors[i] && nodeColors[i].isBridge) {
            const key = nodeColors[i].colors.slice().sort().join('-');
            bridgePairs.set(key, i);
        }
    }

    // For each real bridge, add fake connections that LOOK like they
    // could cross colors but actually dead-end
    for (const [pairKey, bridgeIdx] of bridgePairs) {
        const bridgeColors = nodeColors[bridgeIdx].colors;

        // Find non-bridge nodes of each color
        const color0Nodes = [], color1Nodes = [];
        for (let i = 0; i < n; i++) {
            if (i === bridgeIdx || nodeColors[i].isBridge) continue;
            if (nodeColors[i].colors[0] === bridgeColors[0]) color0Nodes.push(i);
            if (nodeColors[i].colors[0] === bridgeColors[1]) color1Nodes.push(i);
        }

        // Add a "fake bridge" edge: connect two nodes of same color
        // that are near the real bridge, suggesting a wrong path
        if (color0Nodes.length > 0 && rng.nextFloat() < 0.5) {
            const target = color0Nodes[rng.nextInt(0, color0Nodes.length - 1)];
            const bridgeNeighbors = graph.neighbors(bridgeIdx);
            for (const nb of bridgeNeighbors) {
                if (nb === target || graph.hasEdge(target, nb)) continue;
                if (areColorCompatible(nodeColors[target], nodeColors[nb])) {
                    graph.addEdge(target, nb);
                    break;
                }
            }
        }
    }
}

// ════════════════════════════════════════════════════════════
// TRAP 6: Parity Trap (advanced)
// ════════════════════════════════════════════════════════════
// Add edges creating small subgraphs where the player must
// enter and exit an even number of times.

function addParityTraps(rng, solutionPath, graph, nodeColors, level) {
    if (level < CONFIG.TRAPS.PARITY_START_LEVEL) return;
    const n = solutionPath.length;
    if (n < 10) return;

    // Create a small "room" of 3-4 interconnected nodes
    // with only 2 exits to the rest of the graph.
    // Player must plan entry/exit carefully.

    const roomSize = 3;
    const startPos = rng.nextInt(3, n - roomSize - 3);
    const roomNodes = [];
    for (let i = 0; i < roomSize; i++) {
        roomNodes.push(solutionPath[startPos + i]);
    }

    // Fully connect the room
    for (let i = 0; i < roomNodes.length; i++) {
        for (let j = i + 1; j < roomNodes.length; j++) {
            if (!graph.hasEdge(roomNodes[i], roomNodes[j])) {
                if (!nodeColors || areColorCompatible(nodeColors[roomNodes[i]], nodeColors[roomNodes[j]])) {
                    graph.addEdge(roomNodes[i], roomNodes[j]);
                }
            }
        }
    }

    // Add extra entry/exit to the room from non-adjacent path nodes
    const exitNode = solutionPath[rng.nextInt(startPos + roomSize + 1, Math.min(n - 1, startPos + roomSize + 3))];
    const entryNode = solutionPath[rng.nextInt(Math.max(0, startPos - 3), startPos - 1)];

    if (!graph.hasEdge(exitNode, roomNodes[roomNodes.length - 1])) {
        if (!nodeColors || areColorCompatible(nodeColors[exitNode], nodeColors[roomNodes[roomNodes.length - 1]])) {
            graph.addEdge(exitNode, roomNodes[roomNodes.length - 1]);
        }
    }
    if (!graph.hasEdge(entryNode, roomNodes[0])) {
        if (!nodeColors || areColorCompatible(nodeColors[entryNode], nodeColors[roomNodes[0]])) {
            graph.addEdge(entryNode, roomNodes[0]);
        }
    }
}

// ════════════════════════════════════════════════════════════
// Random filler edges (light seasoning)
// ════════════════════════════════════════════════════════════

function addRandomEdges(rng, graph, nodeColors, count) {
    const n = graph.vertexCount;
    if (n < 4 || count <= 0) return;
    let added = 0, attempts = 0;
    while (added < count && attempts < count * 25) {
        const a = rng.nextInt(0, n - 1);
        const b = rng.nextInt(0, n - 1);
        attempts++;
        if (a === b || graph.hasEdge(a, b)) continue;
        if (nodeColors && nodeColors[a] && nodeColors[b]) {
            if (!areColorCompatible(nodeColors[a], nodeColors[b])) continue;
        }
        graph.addEdge(a, b);
        added++;
    }
}

// ════════════════════════════════════════════════════════════
// Validate solution
// ════════════════════════════════════════════════════════════

function validateSolution(path, graph, nodeColors) {
    if (path.length !== graph.vertexCount) return false;
    const visited = new Set();
    for (let i = 0; i < path.length; i++) {
        if (visited.has(path[i])) return false;
        visited.add(path[i]);
        if (i > 0) {
            if (!graph.hasEdge(path[i - 1], path[i])) return false;
            if (nodeColors) {
                const a = nodeColors[path[i - 1]], b = nodeColors[path[i]];
                if (a && b && !areColorCompatible(a, b)) return false;
            }
            // Bridge color-switch check
            if (i >= 2 && nodeColors) {
                const prev = nodeColors[path[i - 2]];
                const curr = nodeColors[path[i - 1]];
                const next = nodeColors[path[i]];
                if (curr && curr.isBridge && prev && next) {
                    let entryColor = -1;
                    for (const c of prev.colors) {
                        if (curr.colors.includes(c)) { entryColor = c; break; }
                    }
                    if (entryColor !== -1) {
                        const exitColor = curr.colors.find(c => c !== entryColor);
                        if (exitColor !== undefined && !next.colors.includes(exitColor)) return false;
                    }
                }
            }
        }
    }
    return visited.size === graph.vertexCount;
}

// ════════════════════════════════════════════════════════════
// Canvas projection
// ════════════════════════════════════════════════════════════

function layoutVertices(unitVerts, canvasSize) {
    const padding = CONFIG.CANVAS_PADDING;
    const drawSize = canvasSize - padding * 2;
    const cx = canvasSize / 2, cy = canvasSize / 2;
    const scale = drawSize * CONFIG.LAYOUT.SHAPE_RADIUS_RATIO;
    return unitVerts.map(v => ({ x: cx + v.x * scale, y: cy + v.y * scale }));
}

// ════════════════════════════════════════════════════════════
// Curated tutorial levels (1-3)
// ════════════════════════════════════════════════════════════

function generateCuratedLevel(levelNumber, canvasSize) {
    const seed = hashLevel(levelNumber);
    let unitVerts, solutionPath, distractorEdges;

    if (levelNumber === 1) {
        unitVerts = [{ x: 0, y: -0.6 }, { x: -0.52, y: 0.35 }, { x: 0.52, y: 0.35 }];
        solutionPath = [0, 1, 2];
        distractorEdges = [];
    } else if (levelNumber === 2) {
        unitVerts = [{ x: -0.45, y: -0.45 }, { x: 0.45, y: -0.45 }, { x: 0.45, y: 0.45 }, { x: -0.45, y: 0.45 }];
        solutionPath = [0, 1, 2, 3];
        distractorEdges = [[0, 2]];
    } else {
        const TAU = Math.PI * 2;
        unitVerts = [];
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (TAU * i) / 5;
            unitVerts.push({ x: Math.cos(a) * 0.6, y: Math.sin(a) * 0.6 });
        }
        solutionPath = [0, 1, 2, 3, 4];
        distractorEdges = [[0, 2], [1, 3]];
    }

    const n = unitVerts.length;
    const graph = new Graph(n);
    for (let i = 0; i < solutionPath.length - 1; i++) graph.addEdge(solutionPath[i], solutionPath[i + 1]);
    for (const [u, v] of distractorEdges) graph.addEdge(u, v);
    const nodeColors = unitVerts.map(() => ({ colors: [0], isBridge: false }));

    return {
        levelNumber, difficulty: levelNumber, seed,
        vertices: layoutVertices(unitVerts, canvasSize), unitVertices: unitVerts,
        graph, solutionPath, nodeColors, colorCount: 1,
        optimalMoves: n - 1, vertexCount: n, edgeCount: graph.edgeCount,
    };
}

// ════════════════════════════════════════════════════════════
// Main Generator
// ════════════════════════════════════════════════════════════

export function generateLevel(levelNumber, canvasSize = 600) {
    if (levelNumber <= 3) return generateCuratedLevel(levelNumber, canvasSize);

    const seed = hashLevel(levelNumber);
    const difficulty = getDifficulty(levelNumber);
    const colorCount = getColorCount(levelNumber);
    const nodeCount = getNodeCount(difficulty);
    const deadEndCount = getDeadEndCount(levelNumber);
    const cycleCount = getCycleCount(levelNumber);
    const decoyCount = getDecoyCount(levelNumber);
    const randomEdgeCount = Math.min(3, Math.floor((difficulty - 3) * 0.15));

    for (let attempt = 0; attempt < CONFIG.LAYOUT.MAX_LAYOUT_ATTEMPTS; attempt++) {
        const rng = createRNG(seed + attempt * 7919);

        // 1. Generate solution path
        const solutionPath = generateHamiltonianPath(rng, nodeCount);

        // 2. Place nodes randomly
        let unitVerts = placeNodesRandom(rng, nodeCount);
        if (unitVerts.length < nodeCount) continue;

        // 3. Force-relax layout
        unitVerts = forceRelax(unitVerts, solutionPath);

        // 4. Build graph with solution edges
        const graph = new Graph(nodeCount);
        for (let i = 0; i < solutionPath.length - 1; i++) {
            graph.addEdge(solutionPath[i], solutionPath[i + 1]);
        }

        // 5. Assign colors
        const nodeColors = assignColors(rng, solutionPath, colorCount);

        // 6. Engineer traps (in order of subtlety)
        addDeadEndForks(rng, solutionPath, graph, nodeColors, deadEndCount);
        addCycleTraps(rng, solutionPath, graph, nodeColors, cycleCount);
        addArticulationTraps(rng, solutionPath, graph, nodeColors, levelNumber);
        addDecoyPaths(rng, solutionPath, graph, nodeColors, decoyCount);
        addColorBottlenecks(rng, solutionPath, nodeColors, graph, colorCount);
        addParityTraps(rng, solutionPath, graph, nodeColors, levelNumber);
        if (randomEdgeCount > 0) addRandomEdges(rng, graph, nodeColors, randomEdgeCount);

        // 7. Validate solution
        if (!validateSolution(solutionPath, graph, nodeColors)) continue;

        // 8. Quality check layout (with all edges now placed)
        if (!qualityCheck(unitVerts, graph)) {
            // Try one more force-relax pass with the full graph
            unitVerts = forceRelax(unitVerts, solutionPath);
            if (!checkNodeSpacing(unitVerts)) continue;
            // Accept with relaxed edge constraints for dense graphs
        }

        // 9. Project to canvas
        const canvasVertices = layoutVertices(unitVerts, canvasSize);

        return {
            levelNumber, difficulty, seed,
            vertices: canvasVertices, unitVertices: unitVerts,
            graph, solutionPath, nodeColors, colorCount,
            optimalMoves: nodeCount - 1, vertexCount: nodeCount,
            edgeCount: graph.edgeCount,
        };
    }

    return generateCuratedLevel(1, canvasSize);
}

export function relayoutLevel(level, canvasSize) {
    level.vertices = layoutVertices(level.unitVertices, canvasSize);
    level._edgeCurves = null; // force recompute
    return level;
}
