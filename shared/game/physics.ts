export type GravityDirection = 1 | -1;

export type FrameStep = {
  dt: number;
  stepCount: number;
  stepDt: number;
};

export type SurfaceScanInput = {
  rects: number[];
  footLeft: number;
  footRight: number;
  prevTop: number;
  prevBottom: number;
  charTop: number;
  charBottom: number;
  landingMinOverlap: number;
  groundedEpsilon: number;
};

export type SurfaceScanResult = {
  nearestDownSurface: number;
  farthestDownSurface: number;
  nearestUpSurface: number;
};

export type GroundedCheckInput = {
  gravityDir: GravityDirection;
  inFlatZone: boolean;
  posY: number;
  charH: number;
  groundY: number;
  flatTopY: number;
  rects: number[];
  footLeft: number;
  footRight: number;
  supportMinOverlap: number;
  groundedEpsilon: number;
};

export function normalizeFrameStep(rawDt: number, maxDt = 64, baseStepMs = 16): FrameStep {
  'worklet';
  const dt = Math.min(maxDt, Math.max(1, rawDt));
  const stepCount = Math.max(1, Math.ceil(dt / baseStepMs));
  return { dt, stepCount, stepDt: dt / stepCount };
}

export function scanCollisionSurfaces({
  rects,
  footLeft,
  footRight,
  prevTop,
  prevBottom,
  charTop,
  charBottom,
  landingMinOverlap,
  groundedEpsilon,
}: SurfaceScanInput): SurfaceScanResult {
  'worklet';
  let nearestDownSurface = Number.POSITIVE_INFINITY;
  let farthestDownSurface = Number.NEGATIVE_INFINITY;
  let nearestUpSurface = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < rects.length; i += 4) {
    const px = rects[i];
    const py = rects[i + 1];
    const pw = rects[i + 2];
    const ph = rects[i + 3];
    const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
    if (overlap < landingMinOverlap) continue;

    const crossedDown = prevBottom <= py + groundedEpsilon && charBottom >= py;
    const alreadyOnSurface = Math.abs(prevBottom - py) <= groundedEpsilon;
    if (py < nearestDownSurface && (crossedDown || alreadyOnSurface)) {
      nearestDownSurface = py;
    }
    if (py > farthestDownSurface) {
      farthestDownSurface = py;
    }

    const bottomSurface = py + ph;
    const crossedUp = prevTop >= bottomSurface - groundedEpsilon && charTop <= bottomSurface;
    const alreadyOnCeiling = Math.abs(prevTop - bottomSurface) <= groundedEpsilon;
    if (bottomSurface > nearestUpSurface && (crossedUp || alreadyOnCeiling)) {
      nearestUpSurface = bottomSurface;
    }
  }

  return {
    nearestDownSurface,
    farthestDownSurface,
    nearestUpSurface,
  };
}

export function isGrounded({
  gravityDir,
  inFlatZone,
  posY,
  charH,
  groundY,
  flatTopY,
  rects,
  footLeft,
  footRight,
  supportMinOverlap,
  groundedEpsilon,
}: GroundedCheckInput): boolean {
  'worklet';
  if (gravityDir === 1) {
    const onBottomFlat = inFlatZone && Math.abs(posY - (groundY - charH)) <= groundedEpsilon;
    if (onBottomFlat) return true;
    for (let i = 0; i < rects.length; i += 4) {
      const px = rects[i];
      const py = rects[i + 1];
      const pw = rects[i + 2];
      const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
      if (overlap >= supportMinOverlap && Math.abs(posY - (py - charH)) <= groundedEpsilon) {
        return true;
      }
    }
    return false;
  }

  const onTopFlat = inFlatZone && Math.abs(posY - flatTopY) <= groundedEpsilon;
  if (onTopFlat) return true;
  for (let i = 0; i < rects.length; i += 4) {
    const px = rects[i];
    const py = rects[i + 1];
    const pw = rects[i + 2];
    const ph = rects[i + 3];
    const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
    if (overlap >= supportMinOverlap && Math.abs(posY - (py + ph)) <= groundedEpsilon) {
      return true;
    }
  }
  return false;
}
