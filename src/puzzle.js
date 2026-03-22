// ═══════════════════════════════════════════════════════════
// Unbroken — Puzzle State & Logic
// ═══════════════════════════════════════════════════════════

import { CONFIG } from './config.js';
import * as Save from './save.js';

/**
 * Active puzzle state manager.
 * Enforces: each node visited once, each edge used once,
 * color compatibility, bridge color-switch.
 */
export class Puzzle {
    constructor(level) {
        this.level = level;
        this.reset();
    }

    reset() {
        this.path = [];
        this.visitedNodes = new Set();
        this.drawnEdges = new Set();
        this.moveCount = 0;
        this.isComplete = false;
        this.startTime = Date.now();
        this.endTime = null;
        this.hintVertex = null;
        this.hintTimeout = null;
        this.hintsUsed = 0;            // track hints per level
        this.invalidEdge = null;
        this.invalidTimeout = null;
        this.animatingEdge = null;
    }

    _edgeKey(u, v) {
        return u < v ? `${u}-${v}` : `${v}-${u}`;
    }

    get currentVertex() {
        return this.path.length > 0 ? this.path[this.path.length - 1] : null;
    }

    isValidStart(vertexIdx) {
        if (this.path.length > 0) return false;
        return this.level.graph.degree(vertexIdx) > 0;
    }

    /**
     * Check basic color compatibility (share at least one color).
     */
    _areColorCompatible(fromIdx, toIdx) {
        const colors = this.level.nodeColors;
        if (!colors || !colors[fromIdx] || !colors[toIdx]) return true;

        const fromColors = colors[fromIdx].colors;
        const toColors = colors[toIdx].colors;

        for (const c of fromColors) {
            if (toColors.includes(c)) return true;
        }
        return false;
    }

    /**
     * Get shared color between two nodes.
     */
    _getSharedColor(aIdx, bIdx) {
        const colors = this.level.nodeColors;
        if (!colors || !colors[aIdx] || !colors[bIdx]) return -1;

        for (const c of colors[aIdx].colors) {
            if (colors[bIdx].colors.includes(c)) return c;
        }
        return -1;
    }

    /**
     * Check if moving FROM current vertex TO vertexIdx respects bridge rules.
     *
     * Bridge rule: if current vertex is a bridge and we have a previous vertex,
     * the entry color and exit color must differ.
     */
    _isBridgeMoveValid(vertexIdx) {
        const colors = this.level.nodeColors;
        if (!colors) return true;

        const current = this.currentVertex;
        if (current === null) return true;

        const currentColors = colors[current];
        if (!currentColors || !currentColors.isBridge) {
            // Not a bridge — regular compatibility check
            return this._areColorCompatible(current, vertexIdx);
        }

        // Current node IS a bridge
        // If this is only the second node in path, there's no "entry" to constrain
        if (this.path.length < 2) {
            return this._areColorCompatible(current, vertexIdx);
        }

        // Get the node before the bridge (entry side)
        const prevIdx = this.path[this.path.length - 2];
        const entryColor = this._getSharedColor(prevIdx, current);
        if (entryColor === -1) return this._areColorCompatible(current, vertexIdx);

        // Exit color must be the OTHER color of the bridge
        const exitColor = currentColors.colors.find(c => c !== entryColor);
        if (exitColor === undefined) return false;

        // Target must have the exit color
        const toColors = colors[vertexIdx];
        return toColors && toColors.colors.includes(exitColor);
    }

    /** Check if clicking vertexIdx is a valid next move */
    isValidMove(vertexIdx) {
        if (this.isComplete) return false;

        if (this.path.length === 0) {
            return this.isValidStart(vertexIdx);
        }

        const current = this.currentVertex;
        if (vertexIdx === current) return false;

        // Node must not have been visited already
        if (this.visitedNodes.has(vertexIdx)) return false;

        // Must be adjacent
        if (!this.level.graph.hasEdge(current, vertexIdx)) return false;

        // Edge must not already be drawn
        const key = this._edgeKey(current, vertexIdx);
        if (this.drawnEdges.has(key)) return false;

        // Bridge color-switch check (includes regular color compatibility)
        if (!this._isBridgeMoveValid(vertexIdx)) return false;

        return true;
    }

    makeMove(vertexIdx) {
        this.clearHint();
        this.clearInvalid();

        if (this.path.length === 0) {
            if (!this.isValidStart(vertexIdx)) {
                return { success: false, invalidReason: 'not_valid_start' };
            }
            this.path.push(vertexIdx);
            this.visitedNodes.add(vertexIdx);
            return { success: true, complete: false };
        }

        if (!this.isValidMove(vertexIdx)) {
            const current = this.currentVertex;

            if (this.visitedNodes.has(vertexIdx)) {
                this.showInvalid(current, vertexIdx);
                return { success: false, invalidReason: 'node_visited' };
            }

            if (!this.level.graph.hasEdge(current, vertexIdx)) {
                this.showInvalid(current, vertexIdx);
                return { success: false, invalidReason: 'no_edge' };
            }

            const key = this._edgeKey(current, vertexIdx);
            if (this.drawnEdges.has(key)) {
                this.showInvalid(current, vertexIdx);
                return { success: false, invalidReason: 'edge_used' };
            }

            // Color or bridge constraint
            this.showInvalid(current, vertexIdx);
            return { success: false, invalidReason: 'wrong_color' };
        }

        const current = this.currentVertex;
        const key = this._edgeKey(current, vertexIdx);

        this.animatingEdge = { from: current, to: vertexIdx, progress: 0 };
        this.drawnEdges.add(key);
        this.path.push(vertexIdx);
        this.visitedNodes.add(vertexIdx);
        this.moveCount++;

        if (this.visitedNodes.size === this.level.vertexCount) {
            this.isComplete = true;
            this.endTime = Date.now();
        }

        return { success: true, complete: this.isComplete };
    }

    undo() {
        this.clearHint();
        this.clearInvalid();

        if (this.path.length <= 1) {
            this.path = [];
            this.visitedNodes.clear();
            this.drawnEdges.clear();
            this.moveCount = 0;
            this.isComplete = false;
            this.animatingEdge = null;
            return;
        }

        const last = this.path.pop();
        this.visitedNodes.delete(last);
        const prev = this.path[this.path.length - 1];
        const key = this._edgeKey(prev, last);
        this.drawnEdges.delete(key);
        this.moveCount = Math.max(0, this.moveCount - 1);
        this.isComplete = false;
        this.animatingEdge = null;
    }

    getElapsedTime() {
        if (this.endTime) return this.endTime - this.startTime;
        if (this.path.length === 0) return 0;
        return Date.now() - this.startTime;
    }

    getStars() {
        if (!this.isComplete) return 0;
        const secsPerNode = (this.getElapsedTime() / 1000) / this.level.vertexCount;
        if (secsPerNode <= CONFIG.SCORING.THREE_STAR_SECS_PER_NODE) return 3;
        if (secsPerNode <= CONFIG.SCORING.TWO_STAR_SECS_PER_NODE) return 2;
        return 1;
    }

    /**
     * Check if hints are available.
     * Free play = unlimited. Normal = 3 per level.
     */
    canUseHint() {
        const settings = Save.getSettings();
        if (settings.freePlay) return true;
        return this.hintsUsed < CONFIG.HINT.MAX_HINTS_PER_LEVEL;
    }

    get hintsRemaining() {
        const settings = Save.getSettings();
        if (settings.freePlay) return Infinity;
        return Math.max(0, CONFIG.HINT.MAX_HINTS_PER_LEVEL - this.hintsUsed);
    }

    /**
     * Get a hint using backtracking DFS.
     * Respects bridge color-switch constraint.
     */
    getHint() {
        if (this.isComplete) return null;

        if (this.path.length === 0) {
            return this.level.solutionPath[0];
        }

        const current = this.currentVertex;

        // Try solution path first
        const solIdx = this.level.solutionPath.indexOf(current);
        if (solIdx >= 0 && solIdx < this.level.solutionPath.length - 1) {
            const nextSol = this.level.solutionPath[solIdx + 1];
            if (!this.visitedNodes.has(nextSol) && this.level.graph.hasEdge(current, nextSol)) {
                if (this._isBridgeMoveValid(nextSol)) {
                    return nextSol;
                }
            }
        }

        // Backtracking DFS
        const bestMove = this._findBestMove(current);
        if (bestMove !== null) return bestMove;

        // Last resort
        const neighbors = this.level.graph.neighbors(current);
        for (const nb of neighbors) {
            if (!this.visitedNodes.has(nb) && this._isBridgeMoveValid(nb)) {
                return nb;
            }
        }

        return null;
    }

    _findBestMove(current) {
        const neighbors = this.level.graph.neighbors(current);
        const validNeighbors = neighbors.filter(nb =>
            !this.visitedNodes.has(nb) &&
            !this.drawnEdges.has(this._edgeKey(current, nb)) &&
            this._isBridgeMoveValid(nb)
        );

        for (const nb of validNeighbors) {
            this.visitedNodes.add(nb);
            this.path.push(nb);  // needed for bridge checks in deeper DFS
            const canComplete = this._canComplete(nb, this.visitedNodes, 0);
            this.path.pop();
            this.visitedNodes.delete(nb);

            if (canComplete) return nb;
        }

        return validNeighbors.length > 0 ? validNeighbors[0] : null;
    }

    _canComplete(current, visited, depth) {
        if (visited.size === this.level.vertexCount) return true;
        if (depth > CONFIG.HINT.MAX_SEARCH_DEPTH) return false;

        const neighbors = this.level.graph.neighbors(current);
        const colors = this.level.nodeColors;

        for (const nb of neighbors) {
            if (visited.has(nb)) continue;

            // Check bridge color-switch constraint
            let valid = true;
            if (colors && colors[current] && colors[current].isBridge && this.path.length >= 2) {
                const prevIdx = this.path[this.path.length - 2];
                const entryColor = this._getSharedColor(prevIdx, current);
                if (entryColor !== -1) {
                    const exitColor = colors[current].colors.find(c => c !== entryColor);
                    if (exitColor !== undefined) {
                        valid = colors[nb] && colors[nb].colors.includes(exitColor);
                    } else {
                        valid = this._areColorCompatible(current, nb);
                    }
                } else {
                    valid = this._areColorCompatible(current, nb);
                }
            } else {
                valid = this._areColorCompatible(current, nb);
            }

            if (!valid) continue;

            visited.add(nb);
            this.path.push(nb);
            if (this._canComplete(nb, visited, depth + 1)) {
                this.path.pop();
                visited.delete(nb);
                return true;
            }
            this.path.pop();
            visited.delete(nb);
        }

        return false;
    }

    showHint() {
        if (!this.canUseHint()) return null;

        const hint = this.getHint();
        if (hint !== null) {
            this.hintsUsed++;
            this.hintVertex = hint;
            if (this.hintTimeout) clearTimeout(this.hintTimeout);
            this.hintTimeout = setTimeout(() => {
                this.hintVertex = null;
            }, CONFIG.HINT.HIGHLIGHT_DURATION);
        }
        return hint;
    }

    clearHint() {
        this.hintVertex = null;
        if (this.hintTimeout) {
            clearTimeout(this.hintTimeout);
            this.hintTimeout = null;
        }
    }

    showInvalid(from, to) {
        this.invalidEdge = { from, to };
        if (this.invalidTimeout) clearTimeout(this.invalidTimeout);
        this.invalidTimeout = setTimeout(() => {
            this.invalidEdge = null;
        }, 500);
    }

    clearInvalid() {
        this.invalidEdge = null;
        if (this.invalidTimeout) {
            clearTimeout(this.invalidTimeout);
            this.invalidTimeout = null;
        }
    }

    getAvailableMoves() {
        if (this.currentVertex === null) return [];
        const moves = [];
        for (const nb of this.level.graph.neighbors(this.currentVertex)) {
            if (!this.visitedNodes.has(nb) &&
                !this.drawnEdges.has(this._edgeKey(this.currentVertex, nb)) &&
                this._isBridgeMoveValid(nb)) {
                moves.push(nb);
            }
        }
        return moves;
    }

    isSolvable() {
        if (this.isComplete) return true;
        if (this.path.length === 0) return true;
        return this.getAvailableMoves().length > 0;
    }
}
