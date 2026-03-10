import { PNG } from 'pngjs';
import type {
  GeneratedSpriteAnimationDescriptor,
  GeneratedSpriteFrameDescriptor,
} from '../../../shared/character-generation-contracts';

type PngImage = InstanceType<typeof PNG>;

const GRID_COLUMNS = 6;
const GRID_ROWS = 3;
const FRAME_PADDING = 2;
const ALPHA_THRESHOLD = 12;

type CellRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type VisibleBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type SpriteSheetDiagnostics = {
  idleBaselineRange: number;
  idleLowerBodyCenterRange: number;
};

const alphaAt = (png: PngImage, x: number, y: number) =>
  png.data[(y * png.width + x) * 4 + 3] ?? 0;

const buildCell = (cellWidth: number, cellHeight: number, row: number, column: number): CellRect => ({
  x: cellWidth * column,
  y: cellHeight * row,
  width: cellWidth,
  height: cellHeight,
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const findVisibleBounds = (png: PngImage, cell: CellRect): VisibleBounds | null => {
  let left = cell.x + cell.width;
  let right = cell.x;
  let top = cell.y + cell.height;
  let bottom = cell.y;
  let found = false;

  for (let y = cell.y; y < cell.y + cell.height; y += 1) {
    for (let x = cell.x; x < cell.x + cell.width; x += 1) {
      if (alphaAt(png, x, y) <= ALPHA_THRESHOLD) continue;
      found = true;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y + 1);
    }
  }

  if (!found) return null;

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

const estimateLowerBodyCenter = (png: PngImage, bounds: VisibleBounds) => {
  const bandStart = bounds.top + Math.floor(bounds.height * 0.55);
  let weightedX = 0;
  let count = 0;

  for (let y = bandStart; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      if (alphaAt(png, x, y) <= ALPHA_THRESHOLD) continue;
      weightedX += x + 0.5;
      count += 1;
    }
  }

  if (count === 0) {
    return bounds.left + bounds.width / 2;
  }

  return weightedX / count;
};

const toFrameDescriptor = (
  png: PngImage,
  cell: CellRect
): { frame: GeneratedSpriteFrameDescriptor; lowerBodyCenterOffsetX: number; baselineY: number } => {
  const visible = findVisibleBounds(png, cell);
  if (!visible) {
    return {
      frame: {
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
        anchorX: Math.round(cell.width / 2),
        anchorY: cell.height,
        referenceHeight: cell.height,
      },
      lowerBodyCenterOffsetX: cell.width / 2,
      baselineY: cell.y + cell.height,
    };
  }

  const cropLeft = clamp(visible.left - FRAME_PADDING, cell.x, cell.x + cell.width);
  const cropTop = clamp(visible.top - FRAME_PADDING, cell.y, cell.y + cell.height);
  const cropRight = clamp(
    visible.right + FRAME_PADDING,
    cell.x,
    cell.x + cell.width
  );
  const cropBottom = clamp(
    visible.bottom + FRAME_PADDING,
    cell.y,
    cell.y + cell.height
  );
  const lowerBodyCenterX = estimateLowerBodyCenter(png, visible);
  const baselineY = visible.bottom;

  return {
    frame: {
      x: cropLeft,
      y: cropTop,
      width: cropRight - cropLeft,
      height: cropBottom - cropTop,
      anchorX: clamp(Math.round(lowerBodyCenterX - cropLeft), 0, cropRight - cropLeft),
      anchorY: clamp(Math.round(baselineY - cropTop), 0, cropBottom - cropTop),
      referenceHeight: cell.height,
    },
    lowerBodyCenterOffsetX: lowerBodyCenterX - cell.x,
    baselineY,
  };
};

const range = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
};

export const analyzeGeneratedSpriteSheet = (buffer: Buffer): {
  animation: GeneratedSpriteAnimationDescriptor;
  diagnostics: SpriteSheetDiagnostics;
} => {
  const png = PNG.sync.read(buffer);
  const cellWidth = Math.floor(png.width / GRID_COLUMNS);
  const cellHeight = Math.floor(png.height / GRID_ROWS);

  const run = Array.from({ length: 6 }, (_, column) =>
    toFrameDescriptor(png, buildCell(cellWidth, cellHeight, 0, column))
  );
  const jumpRow = Array.from({ length: 6 }, (_, column) =>
    toFrameDescriptor(png, buildCell(cellWidth, cellHeight, 1, column))
  );
  const idle = Array.from({ length: 6 }, (_, column) =>
    toFrameDescriptor(png, buildCell(cellWidth, cellHeight, 2, column))
  );

  return {
    animation: {
      version: 1,
      actions: {
        run: run.map((entry) => entry.frame),
        jump: jumpRow.slice(0, 3).map((entry) => entry.frame),
        fall: jumpRow.slice(3, 5).map((entry) => entry.frame),
        idle: idle.map((entry) => entry.frame),
      },
    },
    diagnostics: {
      idleBaselineRange: range(idle.map((entry) => entry.baselineY)),
      idleLowerBodyCenterRange: range(idle.map((entry) => entry.lowerBodyCenterOffsetX)),
    },
  };
};
