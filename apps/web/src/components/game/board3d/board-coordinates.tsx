'use client';

import { useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

const FILES = 'abcdefgh';
/** Middle of the wooden frame: the board is 8 wide and the frame 9.4, so 0.7 per side. */
const EDGE = 4.35;
const GLYPH_SIZE = 0.42;

// Light "engraved" wood tone, readable on the dark frame without competing with the pieces.
function glyphTexture(text: string, fill = 'rgba(243, 223, 181, 0.92)'): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${text.length > 1 ? 64 : 92}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
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

/** Square name ("A1") lying on an empty square: dark on light squares, light on dark, 30% transparent. */
export function SquareName({ flip, light, text }: { flip: boolean; light: boolean; text: string }) {
  const texture = useMemo(
    () => glyphTexture(text, light ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)'),
    [light, text],
  );
  return (
    <group position={[0, 0.012, 0]} rotation={[0, flip ? Math.PI : 0, 0]}>
      {/* renderOrder -1: drawn before the (transparent) pieces, so a piece in front hides it. */}
      <mesh raycast={() => undefined} renderOrder={-1} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.7, 0.7]} />
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
