// ═══════════════════════════════════════════════════════════
// Unbroken — Configuration & Constants
// ═══════════════════════════════════════════════════════════

export const CONFIG = {
    // ── Game Identity ──
    GAME_TITLE: 'UNBROKEN',
    GAME_SUBTITLE: 'One Path. Every Node. No Return.',
    VERSION: '3.0.0',

    // ── Canvas ──
    CANVAS_PADDING: 80,
    MIN_CANVAS_SIZE: 400,

    // ── Colors (Dark Minimal Theme) ──
    COLORS: {
        BG: '#0a0a0f',
        BG_GRADIENT_START: '#0a0a0f',
        BG_GRADIENT_END: '#12121f',
        GRID_LINE: 'rgba(255,255,255,0.02)',

        // Puzzle elements
        EDGE_GHOST: 'rgba(255,255,255,0.12)',
        EDGE_DRAWN: '#7c6aef',
        EDGE_DRAWN_GLOW: 'rgba(124,106,239,0.4)',
        EDGE_INVALID: '#ef4444',

        VERTEX_DEFAULT: 'rgba(255,255,255,0.5)',
        VERTEX_HOVER: '#a78bfa',
        VERTEX_ACTIVE: '#7c6aef',
        VERTEX_START: '#34d399',
        VERTEX_CURRENT: '#f0abfc',
        VERTEX_VISITED: 'rgba(255,255,255,0.18)',
        VERTEX_RING: 'rgba(124,106,239,0.25)',

        // Path drawing
        PATH_STROKE: '#7c6aef',
        PATH_GLOW: 'rgba(124,106,239,0.5)',

        // UI
        TEXT_PRIMARY: '#e2e8f0',
        TEXT_SECONDARY: 'rgba(255,255,255,0.5)',
        TEXT_ACCENT: '#a78bfa',
        PANEL_BG: 'rgba(15,15,25,0.85)',
        PANEL_BORDER: 'rgba(124,106,239,0.2)',
        BUTTON_BG: 'rgba(124,106,239,0.15)',
        BUTTON_HOVER: 'rgba(124,106,239,0.3)',
        BUTTON_TEXT: '#c4b5fd',

        // Stars
        STAR_GOLD: '#fbbf24',
        STAR_EMPTY: 'rgba(255,255,255,0.15)',

        // Effects
        PARTICLE_COLORS: ['#7c6aef', '#a78bfa', '#c4b5fd', '#34d399', '#fbbf24'],
        WIN_GLOW: '#34d399',
    },

    // ── Node Colors (10 colors for color mechanic) ──
    NODE_COLORS: [
        { name: 'blue',    hex: '#60a5fa', glow: 'rgba(96,165,250,0.4)',  dim: 'rgba(96,165,250,0.25)' },
        { name: 'orange',  hex: '#fb923c', glow: 'rgba(251,146,60,0.4)',  dim: 'rgba(251,146,60,0.25)' },
        { name: 'green',   hex: '#4ade80', glow: 'rgba(74,222,128,0.4)',  dim: 'rgba(74,222,128,0.25)' },
        { name: 'pink',    hex: '#f472b6', glow: 'rgba(244,114,182,0.4)', dim: 'rgba(244,114,182,0.25)' },
        { name: 'yellow',  hex: '#facc15', glow: 'rgba(250,204,21,0.4)',  dim: 'rgba(250,204,21,0.25)' },
        { name: 'red',     hex: '#f87171', glow: 'rgba(248,113,113,0.4)', dim: 'rgba(248,113,113,0.25)' },
        { name: 'cyan',    hex: '#22d3ee', glow: 'rgba(34,211,238,0.4)',  dim: 'rgba(34,211,238,0.25)' },
        { name: 'purple',  hex: '#c084fc', glow: 'rgba(192,132,252,0.4)', dim: 'rgba(192,132,252,0.25)' },
        { name: 'teal',    hex: '#2dd4bf', glow: 'rgba(45,212,191,0.4)',  dim: 'rgba(45,212,191,0.25)' },
        { name: 'coral',   hex: '#fb7185', glow: 'rgba(251,113,133,0.4)', dim: 'rgba(251,113,133,0.25)' },
    ],

    // ── High-Contrast Shapes (one per color, for colorblind mode) ──
    HIGH_CONTRAST_SHAPES: [
        'circle',     // blue
        'diamond',    // orange
        'star',       // green
        'triangle',   // pink
        'square',     // yellow
        'hexagon',    // red
        'pentagon',   // cyan
        'cross',      // purple
        'heart',      // teal
        'arrow',      // coral
    ],

    // ── Color Mechanic Progression ──
    COLOR_MECHANIC: {
        TWO_COLORS_AT: 8,        // levels 8+: 2 colors (earlier)
        THREE_COLORS_AT: 18,     // levels 18+: 3 colors
        FOUR_COLORS_AT: 30,      // levels 30+: 4 colors
        FIVE_COLORS_AT: 45,      // levels 45+: 5 colors
        SIX_COLORS_AT: 60,       // levels 60+: 6 colors
        SEVEN_PLUS_AT: 80,       // levels 80+: 7-10 colors
        MIN_SEGMENT_SIZE: 2,
        MAX_SEGMENT_SIZE: 4,
    },

    // ── Vertex Rendering ──
    VERTEX: {
        RADIUS: 14,
        HIT_RADIUS: 34,
        RING_RADIUS: 22,
        HOVER_SCALE: 1.3,
        PULSE_SPEED: 0.003,
        PULSE_AMPLITUDE: 0.15,
    },

    // ── Edge Rendering ──
    EDGE: {
        GHOST_WIDTH: 1.5,
        DRAWN_WIDTH: 3.5,
        GLOW_WIDTH: 9,
        ANIMATION_SPEED: 0.08,
    },

    // ── Difficulty Progression (faster ramp) ──
    DIFFICULTY: {
        BANDS: [
            { upTo: 5,   base: 1,    rate: 0.5 },
            { upTo: 15,  base: 3.5,  rate: 0.35 },
            { upTo: 30,  base: 7.0,  rate: 0.25 },
            { upTo: 60,  base: 14.5, rate: 0.18 },
            { upTo: 100, base: 20.0, rate: 0.12 },
            { upTo: Infinity, base: 25.0, rate: 0.06 },
        ],
        MIN_NODES: 4,
        MAX_NODES: 28,
        NODE_SCALE: 0.8,
    },

    // ── Trap Engineering ──
    TRAPS: {
        // Dead-end fork: spur branches that trap the player
        // Starts at level 5, +1 every 10 levels
        DEAD_END_FORK_START: 5,
        DEAD_END_FORK_INTERVAL: 10,
        // Cycle injection: shortcut edges forming loops
        // Starts at level 7, +1 every 10 levels
        CYCLE_START: 7,
        CYCLE_INTERVAL: 10,
        // Articulation point traps: bottleneck nodes
        ARTICULATION_START_LEVEL: 13,
        // Decoy paths that share solution openings
        DECOY_MIN_LENGTH: 2,
        DECOY_MAX_COUNT: 4,
        // Parity traps (advanced – level 60+)
        PARITY_START_LEVEL: 60,
    },

    // ── Puzzle Layout ──
    LAYOUT: {
        SHAPE_RADIUS_RATIO: 0.38,
        MIN_VERTEX_DISTANCE: 0.15,      // in unit space [-1,1]
        MIN_NODE_EDGE_DISTANCE: 0.08,   // min clearance: node to non-incident edge
        MAX_EDGE_CROSSINGS: 4,          // reject layouts with too many crossings
        FORCE_ITERATIONS: 80,           // Fruchterman-Reingold relaxation passes
        FORCE_REPULSION: 0.04,          // repulsive force strength
        FORCE_ATTRACTION: 0.005,        // spring force along edges
        FORCE_DAMPING: 0.9,             // velocity damping per iteration
        MAX_LAYOUT_ATTEMPTS: 40,
    },

    // ── Stars / Scoring (time-based) ──
    SCORING: {
        THREE_STAR_SECS_PER_NODE: 1.0,   // ≤1s per node = 3★
        TWO_STAR_SECS_PER_NODE: 1.5,     // ≤1.5s per node = 2★
        // anything above = 1★
    },

    // ── Animations ──
    ANIM: {
        LINE_DRAW_DURATION: 150,
        VERTEX_PULSE_DURATION: 300,
        WIN_DELAY: 400,
        PARTICLE_COUNT: 40,
        PARTICLE_LIFETIME: 1500,
        PARTICLE_SPEED: 3,
        SCREEN_TRANSITION_DURATION: 300,
    },

    // ── Save System ──
    SAVE_KEY: 'unbroken_save',
    SAVE_VERSION: 2,

    // ── Hint System ──
    HINT: {
        MAX_SEARCH_DEPTH: 5000,
        HIGHLIGHT_DURATION: 1500,
        MAX_HINTS_PER_LEVEL: 3,         // 3 hints unless free play
    },

    // ── Level Select ──
    LEVEL_SELECT: {
        COLUMNS: 5,
        ROWS: 6,
        PAGE_SIZE: 30,
        CELL_SIZE: 70,
    },
};
