'use client';

import { useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

const FILES = 'abcdefgh';
/** Middle of the wooden frame: the board is 8 wide and the frame 9.4, so 0.7 per side. */
const EDGE = 4.35;
const GLYPH_SIZE = 0.42;

function glyphTexture(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 92px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Light "engraved" wood tone, readable on the dark frame without competing with the pieces.
  ctx.fillStyle = 'rgba(243, 223, 181, 0.92)';
  ctx.fillText(text, 64, 70);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function Glyph({ flip, text, x, z }: { flip: boolean; text: string; x: number; z: number }) {
  const texture = useMemo(() => glyphTexture(text), [text]);
  return (
    // Turned towards the player's side so letters and numbers read upright from the bottom.
    <group position={[x, 0.002, z]} rotation={[0, flip ? Math.PI : 0, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GLYPH_SIZE, GLYPH_SIZE]} />
        <meshBasicMaterial depthWrite={false} map={texture} toneMapped={false} transparent />
      </mesh>
    </group>
  );
}

/** a–h and 1–8 printed on the wooden frame, on all four sides. */
export function BoardCoordinates({ flip }: { flip: boolean }) {
  const glyphs = [];
  for (let i = 0; i < 8; i += 1) {
    const file = FILES[i]!;
    const rank = String(i + 1);
    const along = i - 3.5;
    const rankZ = 3.5 - i;
    glyphs.push(
      <Glyph flip={flip} key={`f-near-${file}`} text={file} x={along} z={EDGE} />,
      <Glyph flip={flip} key={`f-far-${file}`} text={file} x={along} z={-EDGE} />,
      <Glyph flip={flip} key={`r-left-${rank}`} text={rank} x={-EDGE} z={rankZ} />,
      <Glyph flip={flip} key={`r-right-${rank}`} text={rank} x={EDGE} z={rankZ} />,
    );
  }
  return <>{glyphs}</>;
}
