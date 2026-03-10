import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { analyzeGeneratedSpriteSheet } from '../modules/character-generation/pipeline/generatedSpriteSheetMetadata';

type PngImage = InstanceType<typeof PNG>;

const SHEET_WIDTH = 60;
const SHEET_HEIGHT = 30;
const CELL_WIDTH = 10;
const CELL_HEIGHT = 10;

const fillRect = (png: PngImage, x: number, y: number, width: number, height: number) => {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const index = (py * png.width + px) * 4;
      png.data[index] = 255;
      png.data[index + 1] = 255;
      png.data[index + 2] = 255;
      png.data[index + 3] = 255;
    }
  }
};

const resolveSpriteBasePosition = ({
  frame,
  worldAnchorX,
  worldAnchorY,
}: {
  frame: { width: number; height: number; anchorX: number; anchorY: number };
  worldAnchorX: number;
  worldAnchorY: number;
}) => ({
  x: worldAnchorX - frame.anchorX,
  y: worldAnchorY - frame.anchorY,
});

const buildBaseSheet = () => {
  const png = new PNG({ width: SHEET_WIDTH, height: SHEET_HEIGHT });

  for (let column = 0; column < 6; column += 1) {
    const x = column * CELL_WIDTH;
    fillRect(png, x + 3, 2, 4, 6);
    fillRect(png, x + 3, 11, 4, 7);
  }

  return png;
};

test('analyzeGeneratedSpriteSheet detects idle lower-body drift inside the row', () => {
  const png = buildBaseSheet();
  const idleOffsets = [1, 2, 4, 5, 2, 4];

  for (let column = 0; column < idleOffsets.length; column += 1) {
    const x = column * CELL_WIDTH;
    const offset = idleOffsets[column];
    fillRect(png, x + offset, 22, 4, 6);
  }

  const result = analyzeGeneratedSpriteSheet(PNG.sync.write(png));

  assert.ok(result.diagnostics.idleLowerBodyCenterRange >= 3);
  assert.equal(result.animation.actions.idle.length, 6);
});

test('anchored idle frames keep the same world position when crop widths vary', () => {
  const png = buildBaseSheet();

  for (let column = 0; column < 6; column += 1) {
    const x = column * CELL_WIDTH;
    fillRect(png, x + 4, 22, 2, 6);
    if (column % 2 === 0) {
      fillRect(png, x + 2, 22, 2, 2);
      fillRect(png, x + 6, 22, 2, 2);
    } else {
      fillRect(png, x + 1, 23, 3, 1);
      fillRect(png, x + 6, 23, 3, 1);
    }
  }

  const analysis = analyzeGeneratedSpriteSheet(PNG.sync.write(png));
  const idleFrames = analysis.animation.actions.idle;
  const placements = idleFrames.map((frame) =>
    resolveSpriteBasePosition({
      frame,
      worldAnchorX: 100,
      worldAnchorY: 200,
    })
  );
  const anchoredX = placements.map((placement, index) => placement.x + idleFrames[index].anchorX!);
  const anchoredY = placements.map((placement, index) => placement.y + idleFrames[index].anchorY!);

  assert.deepEqual(new Set(anchoredX).size, 1);
  assert.deepEqual(new Set(anchoredY).size, 1);
});

test('anchored run frames stay grounded while stride widths change', () => {
  const png = buildBaseSheet();

  for (let column = 0; column < 6; column += 1) {
    const x = column * CELL_WIDTH;
    fillRect(png, x + 4, 2, 2, 6);
    fillRect(png, x + 3, 7, 1, 2);
    fillRect(png, x + 6, 7, 1, 2);
    if (column % 2 === 0) {
      fillRect(png, x + 0, 3, 3, 2);
      fillRect(png, x + 7, 3, 3, 2);
    } else {
      fillRect(png, x + 4, 3, 2, 2);
    }
  }

  const analysis = analyzeGeneratedSpriteSheet(PNG.sync.write(png));
  const runFrames = analysis.animation.actions.run;
  const placements = runFrames.map((frame) =>
    resolveSpriteBasePosition({
      frame,
      worldAnchorX: 120,
      worldAnchorY: 210,
    })
  );
  const anchoredX = placements.map((placement, index) => placement.x + runFrames[index].anchorX!);
  const groundedY = placements.map((placement, index) => placement.y + runFrames[index].anchorY!);
  const renderedWidths = runFrames.map((frame) => frame.width);

  assert.deepEqual(new Set(anchoredX).size, 1);
  assert.deepEqual(new Set(groundedY).size, 1);
  assert.ok(Math.max(...renderedWidths) > Math.min(...renderedWidths));
});
