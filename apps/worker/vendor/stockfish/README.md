# Stockfish 18 Lite (single-threaded WASM)

Vendored from https://github.com/nmrugg/stockfish.js releases (`stockfish-18-lite-single.js` +
`.wasm`, NNUE net `nn-9067e33176e8.nnue`). Licensed GPL-3.0, same as upstream Stockfish. The `.js`
file was renamed to `.cjs` because it's a CommonJS UMD bundle (uses `require`), while
`apps/worker/package.json` sets `"type": "module"` — without the `.cjs` extension Node tries to
load it as ESM and fails on `require`.

Used as an external subprocess (spawned via `node stockfish-18-lite-single.cjs`, driven over
stdin/stdout with the standard UCI protocol) by `apps/worker/src/engine/stockfish-engine.ts` —
never statically linked into the application. Do not edit these files by hand; replace both
together if upgrading the engine version (the `.wasm` filename must keep matching the `.js`/`.cjs`
basename, since the bundle derives it at runtime).
