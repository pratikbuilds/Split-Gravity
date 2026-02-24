export type SurfaceEdge = 'left' | 'right';

interface SurfaceEdgeGapInput {
  tileX: number;
  tileY: number;
  drawWidth: number;
  tileSize: number;
  edge: SurfaceEdge;
  isSolidAt: (x: number, y: number) => boolean;
}

export function isSurfaceEdgeGap({
  tileX,
  tileY,
  drawWidth,
  tileSize,
  edge,
  isSolidAt,
}: SurfaceEdgeGapInput): boolean {
  const sampleX = edge === 'left' ? tileX - 0.5 : tileX + drawWidth + 0.5;
  const sampleY = tileY + tileSize * 0.5;
  return !isSolidAt(sampleX, sampleY);
}
