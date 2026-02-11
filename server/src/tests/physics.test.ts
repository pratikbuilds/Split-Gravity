import test from 'node:test';
import assert from 'node:assert/strict';
import * as physicsModule from '../../../shared/game/physics';

const physicsCjs = physicsModule as typeof import('../../../shared/game/physics') & {
  default?: typeof import('../../../shared/game/physics');
};
const physics = physicsCjs.default ?? physicsCjs;

test('normalizeFrameStep clamps dt and computes substeps', () => {
  const clamped = physics.normalizeFrameStep(120);
  assert.equal(clamped.dt, 64);
  assert.equal(clamped.stepCount, 4);
  assert.equal(clamped.stepDt, 16);

  const min = physics.normalizeFrameStep(0);
  assert.equal(min.dt, 1);
  assert.equal(min.stepCount, 1);
});

test('scanCollisionSurfaces resolves down and up crossing surfaces', () => {
  const rects = [
    100,
    200,
    40,
    16, // first platform
    180,
    260,
    40,
    16, // farther platform
  ];

  const down = physics.scanCollisionSurfaces({
    rects,
    footLeft: 110,
    footRight: 130,
    prevTop: 140,
    prevBottom: 198,
    charTop: 150,
    charBottom: 206,
    landingMinOverlap: 2,
    groundedEpsilon: 4,
  });
  assert.equal(down.nearestDownSurface, 200);
  assert.equal(down.farthestDownSurface, 200);
  assert.equal(down.nearestUpSurface, Number.NEGATIVE_INFINITY);

  const up = physics.scanCollisionSurfaces({
    rects,
    footLeft: 110,
    footRight: 130,
    prevTop: 220,
    prevBottom: 280,
    charTop: 214,
    charBottom: 274,
    landingMinOverlap: 2,
    groundedEpsilon: 4,
  });
  assert.equal(up.nearestUpSurface, 216);
});

test('isGrounded detects flat and platform support in both gravity directions', () => {
  const rects = [100, 200, 40, 16];
  const charH = 36;
  const baseInput = {
    inFlatZone: false,
    groundY: 300,
    flatTopY: 64,
    rects,
    footLeft: 108,
    footRight: 132,
    supportMinOverlap: 6,
    groundedEpsilon: 4,
    charH,
  };

  assert.equal(
    physics.isGrounded({
      ...baseInput,
      gravityDir: 1,
      posY: 200 - charH,
    }),
    true
  );

  assert.equal(
    physics.isGrounded({
      ...baseInput,
      gravityDir: -1,
      posY: 200 + 16,
    }),
    true
  );

  assert.equal(
    physics.isGrounded({
      ...baseInput,
      gravityDir: 1,
      inFlatZone: true,
      posY: 300 - charH,
    }),
    true
  );
});

test('isGrounded accepts near-surface epsilon offsets (anti-jitter support)', () => {
  const rects = [100, 200, 40, 16];
  const charH = 36;

  assert.equal(
    physics.isGrounded({
      gravityDir: 1,
      inFlatZone: false,
      posY: 200 - charH + 3,
      charH,
      groundY: 300,
      flatTopY: 64,
      rects,
      footLeft: 108,
      footRight: 132,
      supportMinOverlap: 6,
      groundedEpsilon: 4,
    }),
    true
  );

  assert.equal(
    physics.isGrounded({
      gravityDir: -1,
      inFlatZone: false,
      posY: 200 + 16 - 2,
      charH,
      groundY: 300,
      flatTopY: 64,
      rects,
      footLeft: 108,
      footRight: 132,
      supportMinOverlap: 6,
      groundedEpsilon: 4,
    }),
    true
  );
});
