# UNBROKEN

**One Path. Every Node. No Return.**

An infinite procedural Hamiltonian path puzzle game. Trace a single continuous line through every node — but each node can only be visited once, and there's no going back.

## 🎮 Play Now

**[Play Unbroken](https://hoormazd1379.github.io/Unbroken/)**

## Features

- **∞ Procedural Levels** — Every puzzle is algorithmically generated from a seeded PRNG, so each level is unique and deterministic
- **Color Mechanics** — Nodes come in up to 10 colors. You can only traverse edges between color-compatible nodes
- **Bridge Nodes** — Split-colored nodes that force you to enter on one color and exit on another
- **Engineered Traps** — Dead-end forks, cycle injections, articulation point traps, decoy paths, color bottlenecks, and parity traps that ramp up in difficulty
- **High-Contrast Mode** — Colorblind-friendly rendering with unique geometric shapes per color (diamond, star, triangle, square, hexagon, pentagon, cross, heart, arrow)
- **Time-Based Stars** — Earn up to 3 stars based on solving speed (≤1s per node = ★★★)
- **Hint System** — 3 hints per level (unlimited in Free Play mode)
- **Free Play Mode** — Unlock all levels and get unlimited hints via Settings
- **Responsive Design** — Works on desktop and mobile with touch support

## How to Play

1. **Click any node** to start your path
2. **Click adjacent nodes** to extend your path — each node can only be visited once
3. **Visit every node** to complete the level
4. Watch for **colored edges** — you can only move between nodes that share a color
5. **Bridge nodes** (split-colored) change your color when you pass through them
6. Use **Undo** (↩) or **Reset** (⟲) if you get stuck
7. Use **Hints** (💡) sparingly — you only get 3 per level!

## Tech Stack

- **Vanilla JavaScript** — No frameworks, no build tools, no dependencies
- **HTML5 Canvas** — All rendering via Canvas 2D API
- **CSS3** — Glassmorphism UI with smooth animations
- **ES Modules** — Clean modular architecture
- **localStorage** — Progress saved locally in the browser

## Project Structure

```
├── index.html          # Entry point
├── style.css           # All styling
└── src/
    ├── main.js         # App initialization & game loop
    ├── config.js       # All configuration & constants
    ├── levelgen.js     # Procedural level generation & trap engineering
    ├── puzzle.js       # Puzzle state & move validation
    ├── renderer.js     # Canvas rendering (shapes, curves, effects)
    ├── graph.js        # Undirected graph data structure
    ├── input.js        # Mouse & touch input handling
    ├── ui.js           # DOM-based UI screens
    ├── effects.js      # Particles, animations, screen shake
    ├── state.js        # Screen state machine
    ├── save.js         # localStorage persistence
    └── rng.js          # Seeded PRNG (Mulberry32)
```

## Running Locally

No build step required. Just serve the files:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Then open `http://localhost:8080` in your browser.

## License

MIT
