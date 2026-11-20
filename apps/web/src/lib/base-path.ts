/** Sub-path the app is served under (e.g. `/game`); empty when served at the domain root. Inlined at build time. */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Prefixes a root-relative URL that Next does not rewrite itself (img src, fetch, Worker, window.location). */
export function withBasePath(path: string) {
  return `${basePath}${path}`;
}
