import test from 'node:test';
import assert from 'node:assert/strict';
import * as terrainAutotileModule from '../../../shared/game/terrainAutotile';

const terrainAutotileCjs = terrainAutotileModule as typeof import('../../../shared/game/terrainAutotile') & {
  default?: typeof import('../../../shared/game/terrainAutotile');
};
const terrainAutotile = terrainAutotileCjs.default ?? terrainAutotileCjs;
const isSurfaceEdgeGap = terrainAutotile.isSurfaceEdgeGap;

type Rect = { x: number; y: number; width: number; height: number };

function isSolidAt(rects: Rect[], x: number, y: number): boolean {
  return rects.some(
    (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
  );
}

test('surface edges do not use cap tiles when neighboring ground is at the same level', () => {
  const tileSize = 32;
  const current = { x: 100, y: 200, width: 64, height: 64 };
  const leftNeighbor = { x: 68, y: 200, width: 32, height: 64 };
  const rightNeighbor = { x: 164, y: 200, width: 32, height: 64 };
  const rects = [current, leftNeighbor, rightNeighbor];

  const leftHasGap = isSurfaceEdgeGap({
    tileX: current.x,
    tileY: current.y,
    drawWidth: tileSize,
    tileSize,
    edge: 'left',
    isSolidAt: (x, y) => isSolidAt(rects, x, y),
  });
  const rightHasGap = isSurfaceEdgeGap({
    tileX: current.x + current.width - tileSize,
    tileY: current.y,
    drawWidth: tileSize,
    tileSize,
    edge: 'right',
    isSolidAt: (x, y) => isSolidAt(rects, x, y),
  });

  assert.equal(leftHasGap, false);
  assert.equal(rightHasGap, false);
});

test('surface edges use cap tiles when the neighboring space is a true gap', () => {
  const tileSize = 32;
  const current = { x: 100, y: 200, width: 64, height: 64 };
  const rects = [current];

  const leftHasGap = isSurfaceEdgeGap({
    tileX: current.x,
    tileY: current.y,
    drawWidth: tileSize,
    tileSize,
    edge: 'left',
    isSolidAt: (x, y) => isSolidAt(rects, x, y),
  });
  const rightHasGap = isSurfaceEdgeGap({
    tileX: current.x + current.width - tileSize,
    tileY: current.y,
    drawWidth: tileSize,
    tileSize,
    edge: 'right',
    isSolidAt: (x, y) => isSolidAt(rects, x, y),
  });

  assert.equal(leftHasGap, true);
  assert.equal(rightHasGap, true);
});

test('surface edges treat vertical offsets as exposed gaps', () => {
  const tileSize = 32;
  const current = { x: 100, y: 200, width: 64, height: 64 };
  const steppedNeighbor = { x: 164, y: 232, width: 32, height: 64 };
  const rects = [current, steppedNeighbor];

  const rightHasGap = isSurfaceEdgeGap({
    tileX: current.x + current.width - tileSize,
    tileY: current.y,
    drawWidth: tileSize,
    tileSize,
    edge: 'right',
    isSolidAt: (x, y) => isSolidAt(rects, x, y),
  });

  assert.equal(rightHasGap, true);
});
