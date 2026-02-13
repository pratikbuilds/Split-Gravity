import test from 'node:test';
import assert from 'node:assert/strict';

import * as botSimulationModule from '../../../services/bot/botSimulation';
import * as botAIModule from '../../../services/bot/botAI';
import * as constantsModule from '../../../components/game/constants';
import type { Platform } from '../../../types/game';

const botSimulationCjs =
  botSimulationModule as typeof import('../../../services/bot/botSimulation') & {
    default?: typeof import('../../../services/bot/botSimulation');
  };
const botSimulation = botSimulationCjs.default ?? botSimulationCjs;

const botAICjs = botAIModule as typeof import('../../../services/bot/botAI') & {
  default?: typeof import('../../../services/bot/botAI');
};
const botAI = botAICjs.default ?? botAICjs;

const constantsCjs = constantsModule as typeof import('../../../components/game/constants') & {
  default?: typeof import('../../../components/game/constants');
};
const constants = constantsCjs.default ?? constantsCjs;

const { CHAR_SCALE, CHAR_SIZE, GROUNDED_EPSILON, groundHeight } = constants;
const {
  applyBotFlip,
  createInitialBotState,
  platformsToRects,
  projectBotNormalizedY,
  stepBotPhysics,
} = botSimulation;
const { shouldBotFlip } = botAI;

type BotState = import('../../../services/bot/botSimulation').BotState;
const charH = CHAR_SIZE * CHAR_SCALE;

function makePlatform(
  x: number,
  y: number,
  width: number,
  height: number,
  surface: Platform['surface']
): Platform {
  return { x, y, width, height, surface, tileType: 'grass' };
}

test('bot flip guard prevents repeat flips in cooldown/support-thrash windows', () => {
  const groundY = 400;
  const charX = 200;
  const platforms = [makePlatform(860, 0, 160, 64, 'top')];
  const rects = platformsToRects(platforms);

  let state = createInitialBotState(groundY, 1);
  state = { ...state, scroll: 540, simTimeMs: 40 };

  const pending = shouldBotFlip({
    state,
    platforms,
    rects,
    groundY,
    charX,
    simTimeMs: state.simTimeMs,
    shouldFlipSince: 0,
  });
  assert.equal(pending.flip, false);
  assert.equal(pending.reason, 'reaction-delay');

  const first = shouldBotFlip({
    state,
    platforms,
    rects,
    groundY,
    charX,
    simTimeMs: state.simTimeMs + 30,
    shouldFlipSince: pending.newShouldFlipSince,
  });
  assert.equal(first.flip, true);

  const flipped = applyBotFlip(state);
  assert.equal(flipped.leftSupportSinceFlip, 0);

  const blockedByCooldown = shouldBotFlip({
    state: {
      ...flipped,
      posY: groundHeight,
      lastGroundedAtMs: flipped.simTimeMs + 40,
      wasGroundedLastStep: 1,
    },
    platforms,
    rects,
    groundY,
    charX,
    simTimeMs: flipped.simTimeMs + 40,
    shouldFlipSince: 0,
  });
  assert.equal(blockedByCooldown.flip, false);
  assert.equal(blockedByCooldown.reason, 'flip-cooldown');

  const blockedBySupport = shouldBotFlip({
    state: {
      ...flipped,
      simTimeMs: flipped.simTimeMs + 220,
      posY: groundHeight,
      lastGroundedAtMs: flipped.simTimeMs + 220,
      wasGroundedLastStep: 1,
    },
    platforms,
    rects,
    groundY,
    charX,
    simTimeMs: flipped.simTimeMs + 220,
    shouldFlipSince: 0,
  });
  assert.equal(blockedBySupport.flip, false);
  assert.equal(blockedBySupport.reason, 'must-leave-support');
});

test('bot maintains platform contact without sustained penetration', () => {
  const groundY = 420;
  const height = 520;
  const charX = 120;
  const platformY = 300;
  const platforms = [makePlatform(0, platformY, 4000, 64, 'bottom')];
  const rects = platformsToRects(platforms);

  let state: BotState = {
    ...createInitialBotState(groundY, 1),
    scroll: 900,
    posY: platformY - charH,
    velocityY: 0,
    simTimeMs: 0,
    wasGroundedLastStep: 1,
  };

  let maxPenetration = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < 120; i += 1) {
    state = stepBotPhysics(state, rects, height, groundY, charX, 16);
    const penetration = state.posY + charH - platformY;
    if (penetration > maxPenetration) {
      maxPenetration = penetration;
    }
  }

  assert.ok(maxPenetration <= GROUNDED_EPSILON, `penetration exceeded epsilon: ${maxPenetration}`);
});

test('projectBotNormalizedY clamps out-of-lane values safely', () => {
  const height = 520;

  assert.equal(projectBotNormalizedY(-500, height, charH), 0);
  assert.equal(projectBotNormalizedY(height + 500, height, charH), 1);

  const centerY = groundHeight + (height - 2 * groundHeight - charH) * 0.5;
  const projected = projectBotNormalizedY(centerY, height, charH);
  assert.ok(projected > 0.45 && projected < 0.55);
});

test('bot simulation uses shared frame-step clamping semantics', () => {
  const groundY = 400;
  const height = 520;
  const charX = 120;
  const rects: number[] = [];
  const start = createInitialBotState(groundY, 1);
  const next = stepBotPhysics(start, rects, height, groundY, charX, 120);
  assert.equal(next.simTimeMs, 64);
});

test('bot does not flip while airborne even within prior coyote window', () => {
  const groundY = 400;
  const charX = 200;
  const platforms = [makePlatform(860, 0, 160, 64, 'top')];
  const rects = platformsToRects(platforms);

  const airborne = {
    ...createInitialBotState(groundY, 1),
    scroll: 540,
    simTimeMs: 90,
    posY: groundY - charH + 14,
    lastGroundedAtMs: 80,
    wasGroundedLastStep: 0 as 0,
    leftSupportSinceFlip: 1 as 1,
  };

  const decision = shouldBotFlip({
    state: airborne,
    platforms,
    rects,
    groundY,
    charX,
    simTimeMs: airborne.simTimeMs,
    shouldFlipSince: 0,
  });

  assert.equal(decision.flip, false);
  assert.equal(decision.reason, 'not-grounded');
});
