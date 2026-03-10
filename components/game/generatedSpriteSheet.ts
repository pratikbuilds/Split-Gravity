import type { GeneratedSpriteAnimationDescriptor } from '../../shared/character-generation-contracts';
import type { CharacterAction, SpriteFrame } from './characterSpritePresets';

const GRID_COLUMNS = 6;
const GRID_ROWS = 3;

type Envelope = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isValidFrame = (frame: SpriteFrame) =>
  frame.width > 0 &&
  frame.height > 0 &&
  isFiniteNumber(frame.x) &&
  isFiniteNumber(frame.y) &&
  (!isFiniteNumber(frame.anchorX) || frame.anchorX >= 0) &&
  (!isFiniteNumber(frame.anchorY) || frame.anchorY >= 0);

const toSpriteFrame = (frame: GeneratedSpriteAnimationDescriptor['actions']['run'][number]): SpriteFrame => ({
  x: frame.x,
  y: frame.y,
  width: frame.width,
  height: frame.height,
  anchorX: frame.anchorX,
  anchorY: frame.anchorY,
  referenceHeight: frame.referenceHeight,
});

const buildFallbackFrames = (imageWidth: number, imageHeight: number): Record<CharacterAction, SpriteFrame[]> => {
  const cellWidth = Math.floor(imageWidth / GRID_COLUMNS);
  const cellHeight = Math.floor(imageHeight / GRID_ROWS);
  const rowFrames = (row: number, count = GRID_COLUMNS): SpriteFrame[] =>
    Array.from({ length: count }, (_, index) => ({
      x: cellWidth * index,
      y: cellHeight * row,
      width: cellWidth,
      height: cellHeight,
      anchorX: cellWidth / 2,
      anchorY: cellHeight,
      referenceHeight: cellHeight,
    }));

  return {
    run: rowFrames(0),
    jump: rowFrames(1, 3),
    fall: rowFrames(1).slice(3, 5),
    idle: rowFrames(2),
  };
};

export const resolveGeneratedSpriteActions = (
  imageWidth: number,
  imageHeight: number,
  animation?: GeneratedSpriteAnimationDescriptor | null
): Record<CharacterAction, SpriteFrame[]> => {
  if (
    animation?.version === 1 &&
    animation.actions.run.length === 6 &&
    animation.actions.jump.length === 3 &&
    animation.actions.fall.length === 2 &&
    animation.actions.idle.length === 6
  ) {
    const mapped = {
      run: animation.actions.run.map(toSpriteFrame),
      jump: animation.actions.jump.map(toSpriteFrame),
      fall: animation.actions.fall.map(toSpriteFrame),
      idle: animation.actions.idle.map(toSpriteFrame),
    };

    if (
      mapped.run.every(isValidFrame) &&
      mapped.jump.every(isValidFrame) &&
      mapped.fall.every(isValidFrame) &&
      mapped.idle.every(isValidFrame)
    ) {
      return mapped;
    }
  }

  return buildFallbackFrames(imageWidth, imageHeight);
};

export const resolveSpriteAnchorX = (frame: SpriteFrame) => frame.anchorX ?? frame.width / 2;

export const resolveSpriteAnchorY = (frame: SpriteFrame) => frame.anchorY ?? frame.height;

export const resolveSpriteReferenceHeight = (frame: SpriteFrame) =>
  frame.referenceHeight ?? frame.height;

export const resolveSpriteBasePosition = ({
  frame,
  scale,
  gravityDirection,
  worldAnchorX,
  worldAnchorY,
}: {
  frame: SpriteFrame;
  scale: number;
  gravityDirection: 1 | -1;
  worldAnchorX: number;
  worldAnchorY: number;
}) => {
  const anchorX = resolveSpriteAnchorX(frame) * scale;
  const anchorY = resolveSpriteAnchorY(frame) * scale;
  const renderHeight = frame.height * scale;

  return {
    x: worldAnchorX - anchorX,
    y:
      gravityDirection === -1
        ? worldAnchorY - (renderHeight - anchorY)
        : worldAnchorY - anchorY,
  };
};

export const getSpriteActionEnvelope = (frames: readonly SpriteFrame[]): Envelope => {
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;

  for (const frame of frames) {
    const anchorX = resolveSpriteAnchorX(frame);
    const anchorY = resolveSpriteAnchorY(frame);
    left = Math.max(left, anchorX);
    right = Math.max(right, frame.width - anchorX);
    top = Math.max(top, anchorY);
    bottom = Math.max(bottom, frame.height - anchorY);
  }

  return {
    left,
    right,
    top,
    bottom,
    width: left + right,
    height: top + bottom,
  };
};
