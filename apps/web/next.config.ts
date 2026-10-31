import type { NextConfig } from 'next';

const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1');
const websocketOrigin = `${apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${apiUrl.host}`;
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `connect-src 'self' ${apiUrl.origin} ${websocketOrigin}`,
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https: http:",
  // blob: plays the AI voice (TTS audio fetched from the API).
  "media-src 'self' data: blob:",
  "object-src 'none'",
  // wasm-unsafe-eval lets the Treinador's Stockfish (WebAssembly) compile; it does not allow eval().
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
        source: '/:path*',
      },
    ];
  },
  output: 'standalone',
  reactStrictMode: true,
};

export default nextConfig;
