# Stockfish 18 Lite (browser)

Same vendored engine as `apps/worker/vendor/stockfish/` (see that folder's README for
provenance/license — GPL-3.0). Served as a static asset and spawned as a Web Worker
(`new Worker('/engine/stockfish-18-lite-single.js')`) by
`apps/web/src/lib/engine/browser-engine.ts` for the Treinador's real-time move check and
"Sugerir lance" — never statically linked into the app bundle. Unlike the worker's copy, this
one keeps the original `.js` extension: it runs as a classic Worker script, not a Node ESM/CJS
module, so there's no `require`-vs-`"type":"module"` conflict here.
