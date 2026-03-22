// ═══════════════════════════════════════════════════════════
// Unbroken — Graph Data Structures
// ═══════════════════════════════════════════════════════════

/**
 * Undirected graph represented as an adjacency list.
 */
export class Graph {
    constructor(vertexCount) {
        this.vertexCount = vertexCount;
        this.adj = new Map();
        this.edges = [];
        this.edgeSet = new Set();

        for (let i = 0; i < vertexCount; i++) {
            this.adj.set(i, new Set());
        }
    }

    _edgeKey(u, v) {
        return u < v ? `${u}-${v}` : `${v}-${u}`;
    }

    hasEdge(u, v) {
        return this.edgeSet.has(this._edgeKey(u, v));
    }

    addEdge(u, v) {
        if (u === v) return false;
        const key = this._edgeKey(u, v);
        if (this.edgeSet.has(key)) return false;

        this.edgeSet.add(key);
        this.edges.push({ u, v });
        this.adj.get(u).add(v);
        this.adj.get(v).add(u);
        return true;
    }

    degree(v) {
        return this.adj.get(v)?.size || 0;
    }

    neighbors(v) {
        return [...(this.adj.get(v) || [])];
    }

    get edgeCount() {
        return this.edges.length;
    }

    /** Clone the graph */
    clone() {
        const g = new Graph(this.vertexCount);
        for (const e of this.edges) {
            g.addEdge(e.u, e.v);
        }
        return g;
    }
}
