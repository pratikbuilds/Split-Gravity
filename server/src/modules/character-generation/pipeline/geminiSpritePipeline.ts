import { readFile } from 'node:fs/promises';
import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../../../config/env';
import type { CharacterGenerationSourceType } from '../../../shared/character-generation-contracts';
import { removeKeyedBackground, createThumbnail } from './imageProcessing';
import { analyzeGeneratedSpriteSheet } from './generatedSpriteSheetMetadata';
import { PNG } from 'pngjs';

type GenerateSpriteSheetArgs = {
  prompt: string | null;
  referenceImageDataUrl: string | null;
  sourceType: CharacterGenerationSourceType;
};

type GridCheckResult = {
  columns: number | null;
  rows: number | null;
  fullBodyAllFrames: boolean;
  idleRowFullBodyAllFrames: boolean;
  idleRowLegsVisibleAllFrames: boolean;
  idleRowNoCloseUpCrop: boolean;
  cameraDistanceStable: boolean;
  consistentScale: boolean;
  uniformSpacing: boolean;
  noTextOrUi: boolean;
  idleRowBaselineStable: boolean;
  idleRowPelvisStable: boolean;
  runRowLegInterchangeClear: boolean;
  runRowArmSwingVisible: boolean;
  runRowArcadeSprintReadable: boolean;
};

type InlineImagePart = {
  inlineData: {
    mimeType: string;
    data: string;
  };
};

const RUN_CYCLE_REFERENCE_ASSET_URL = new URL('./assets/run_cycle_ref.png', import.meta.url);
let bundledRunCycleReferencePromise: Promise<InlineImagePart> | null = null;

const extractFirstJsonObject = (raw: string): string | null => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
};

const parseDataUrlImage = (imageBase64: string): { mimeType: string; data: string } => {
  const match = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }

  return {
    mimeType: 'image/png',
    data: imageBase64,
  };
};

const loadBundledRunCycleReference = async (): Promise<InlineImagePart> => {
  if (!bundledRunCycleReferencePromise) {
    bundledRunCycleReferencePromise = readFile(RUN_CYCLE_REFERENCE_ASSET_URL).then((buffer) => ({
      inlineData: {
        mimeType: 'image/png',
        data: buffer.toString('base64'),
      },
    }));
  }

  return bundledRunCycleReferencePromise;
};

export const detectGridDividerArtifacts = (buffer: Buffer) => {
  const png = PNG.sync.read(buffer);
  const cellWidth = Math.floor(png.width / 6);
  const cellHeight = Math.floor(png.height / 3);
  const alphaThreshold = 48;
  const verticalLines = [1, 2, 3, 4, 5].map((index) => index * cellWidth);
  const horizontalLines = [1, 2].map((index) => index * cellHeight);

  const lineOpacityRatio = (
    isVertical: boolean,
    linePosition: number,
    length: number
  ) => {
    let opaqueCount = 0;
    let total = 0;

    for (let offset = 0; offset < length; offset += 1) {
      const x = isVertical ? Math.min(png.width - 1, linePosition) : offset;
      const y = isVertical ? offset : Math.min(png.height - 1, linePosition);
      const alpha = png.data[(y * png.width + x) * 4 + 3] ?? 0;
      if (alpha > alphaThreshold) opaqueCount += 1;
      total += 1;
    }

    return total === 0 ? 0 : opaqueCount / total;
  };

  const verticalOpacityRatios = verticalLines.map((x) => lineOpacityRatio(true, x, png.height));
  const horizontalOpacityRatios = horizontalLines.map((y) => lineOpacityRatio(false, y, png.width));
  const maxVerticalDividerOpacity = Math.max(...verticalOpacityRatios, 0);
  const maxHorizontalDividerOpacity = Math.max(...horizontalOpacityRatios, 0);

  return {
    maxVerticalDividerOpacity,
    maxHorizontalDividerOpacity,
    hasDividerArtifacts:
      maxVerticalDividerOpacity >= 0.8 || maxHorizontalDividerOpacity >= 0.8,
  };
};

export const buildRetryCorrection = (
  failedChecks: string[],
  attempt: number,
  maxAttempts: number
) =>
  `RETRY ${attempt}/${maxAttempts}: Previous output failed checks: ${failedChecks.join(', ')}. ` +
  'Regenerate from scratch. MUST satisfy all: EXACT 6x3 grid, fixed camera distance across all rows, every frame full-body head-to-feet, IDLE row with both legs and both feet visible in all 6 cells and no portrait/bust crops, idle breathing only above the pelvis, feet planted to one baseline, pelvis locked with no side-to-side drift, consistent scale across all 18 frames, uniform spacing and baseline alignment, zero text/UI artifacts, and a readable arcade sprint run cycle with (1) unmistakable left/right leg interchange, (2) strong opposite arm swing in every frame, (3) clear contact, passing, and push phases, (4) no jump-like or both-feet-up poses, and (5) no foot sliding.';

const inspectSpriteSheetGrid = async (
  ai: GoogleGenAI,
  imageDataUrl: string
): Promise<GridCheckResult> => {
  const base64 = imageDataUrl.split(',')[1] || imageDataUrl;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: {
      parts: [
        {
          text: 'Validate this sprite sheet. Return JSON only with columns, rows, fullBodyAllFrames, idleRowFullBodyAllFrames, idleRowLegsVisibleAllFrames, idleRowNoCloseUpCrop, cameraDistanceStable, consistentScale, uniformSpacing, noTextOrUi, idleRowBaselineStable, idleRowPelvisStable, runRowLegInterchangeClear, runRowArmSwingVisible, runRowArcadeSprintReadable.',
        },
        {
          inlineData: {
            mimeType: 'image/png',
            data: base64,
          },
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          columns: { type: Type.INTEGER },
          rows: { type: Type.INTEGER },
          fullBodyAllFrames: { type: Type.BOOLEAN },
          idleRowFullBodyAllFrames: { type: Type.BOOLEAN },
          idleRowLegsVisibleAllFrames: { type: Type.BOOLEAN },
          idleRowNoCloseUpCrop: { type: Type.BOOLEAN },
          cameraDistanceStable: { type: Type.BOOLEAN },
          consistentScale: { type: Type.BOOLEAN },
          uniformSpacing: { type: Type.BOOLEAN },
          noTextOrUi: { type: Type.BOOLEAN },
          idleRowBaselineStable: { type: Type.BOOLEAN },
          idleRowPelvisStable: { type: Type.BOOLEAN },
          runRowLegInterchangeClear: { type: Type.BOOLEAN },
          runRowArmSwingVisible: { type: Type.BOOLEAN },
          runRowArcadeSprintReadable: { type: Type.BOOLEAN },
        },
      },
    },
  });

  const raw = response.text || '';
  const jsonText = extractFirstJsonObject(raw) || raw;

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return {
      columns: Number.isInteger(parsed.columns) ? (parsed.columns as number) : null,
      rows: Number.isInteger(parsed.rows) ? (parsed.rows as number) : null,
      fullBodyAllFrames: parsed.fullBodyAllFrames === true,
      idleRowFullBodyAllFrames: parsed.idleRowFullBodyAllFrames === true,
      idleRowLegsVisibleAllFrames: parsed.idleRowLegsVisibleAllFrames === true,
      idleRowNoCloseUpCrop: parsed.idleRowNoCloseUpCrop === true,
      cameraDistanceStable: parsed.cameraDistanceStable === true,
      consistentScale: parsed.consistentScale === true,
      uniformSpacing: parsed.uniformSpacing === true,
      noTextOrUi: parsed.noTextOrUi === true,
      idleRowBaselineStable: parsed.idleRowBaselineStable === true,
      idleRowPelvisStable: parsed.idleRowPelvisStable === true,
      runRowLegInterchangeClear: parsed.runRowLegInterchangeClear === true,
      runRowArmSwingVisible: parsed.runRowArmSwingVisible === true,
      runRowArcadeSprintReadable: parsed.runRowArcadeSprintReadable === true,
    };
  } catch {
    return {
      columns: null,
      rows: null,
      fullBodyAllFrames: false,
      idleRowFullBodyAllFrames: false,
      idleRowLegsVisibleAllFrames: false,
      idleRowNoCloseUpCrop: false,
      cameraDistanceStable: false,
      consistentScale: false,
      uniformSpacing: false,
      noTextOrUi: false,
      idleRowBaselineStable: false,
      idleRowPelvisStable: false,
      runRowLegInterchangeClear: false,
      runRowArmSwingVisible: false,
      runRowArcadeSprintReadable: false,
    };
  }
};

export const buildPrompt = (prompt: string | null, sourceType: CharacterGenerationSourceType) => {
  const subject = prompt?.trim() || 'reference character';
  const identityReferenceLine =
    sourceType === 'image'
      ? 'If an uploaded character reference image is attached, it is the exact same character. Preserve the uploaded character identity exactly across every frame and do not redesign the silhouette, outfit, face, or signature markings.'
      : 'No uploaded character reference image is attached. Create an original readable character design that stays visually consistent across all 18 frames.';

  return `Create ONE sprite sheet image for a gravity jump game player character.
SUBJECT: ${subject}

IDENTITY LOCK:
${identityReferenceLine}

MOTION GUIDE:
- A separate attached run-cycle reference image is provided by the backend.
- Use that motion reference only for the RUN row pose sequence, leg timing, and arm timing.
- Match the run-row leg and arm positions, timing, and frame order from the motion reference as closely as possible.
- Do NOT copy the motion reference character's design, colors, clothing, face, or accessories. It is a motion-only guide.

SPRITE SHEET STRUCTURE:
- Exactly 6 columns x 3 rows, with row order RUN, JUMP, IDLE.
- Every frame is full body from head to feet with consistent character scale and fixed camera distance.
- The character torso stays centered horizontally in every frame.
- Background must be one flat solid #FF00FF with no separator lines, borders, or cell dividers.
- No text, numbers, UI, logos, watermark, shadows, particles, or decorative extras.

ROW REQUIREMENTS:
- RUN row is a readable exaggerated arcade sprint with unmistakable left/right leg interchange, clear contact/passing/push phases, and strong opposite arm swing in every frame.
- JUMP row is launch, ascent, peak, descent, landing, recovery. Character size stays consistent while vertical position changes.
- IDLE row is subtle breathing only above the pelvis. Feet stay planted to one baseline and the pelvis stays locked with no side-to-side or forward/back drift.

FINAL OUTPUT:
- Return only the final sprite sheet image.`;
};

export class GeminiSpritePipeline {
  private readonly client: GoogleGenAI;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for character generation.');
    }

    this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async generateSpriteSheet({
    prompt,
    referenceImageDataUrl,
    sourceType,
  }: GenerateSpriteSheetArgs) {
    const maxAttempts = 3;
    let correction = '';
    const bundledRunCycleReference = await loadBundledRunCycleReference();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const parts: ({ text: string } | InlineImagePart)[] = [{ text: buildPrompt(prompt, sourceType) }];

      if (referenceImageDataUrl) {
        const { mimeType, data } = parseDataUrlImage(referenceImageDataUrl);
        parts.push({ inlineData: { mimeType, data } });
      }

      parts.push(bundledRunCycleReference);

      if (correction) {
        parts.push({ text: correction });
      }

      const response = await this.client.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts },
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '2K',
          },
        },
      });

      const imagePart = response.candidates?.[0]?.content?.parts?.find(
        (part) => 'inlineData' in part && part.inlineData?.data
      );

      if (!imagePart || !('inlineData' in imagePart) || !imagePart.inlineData?.data) {
        throw new Error('Gemini did not return a sprite sheet image.');
      }

      const rawBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
      const processedBuffer = removeKeyedBackground(rawBuffer);
      const processedDataUrl = `data:image/png;base64,${processedBuffer.toString('base64')}`;
      const inspection = await inspectSpriteSheetGrid(this.client, processedDataUrl);
      const layoutAnalysis = analyzeGeneratedSpriteSheet(processedBuffer);
      const dividerArtifacts = detectGridDividerArtifacts(processedBuffer);
      const idlePixelBaselineStable = layoutAnalysis.diagnostics.idleBaselineRange <= 6;
      const idlePixelCenterStable = layoutAnalysis.diagnostics.idleLowerBodyCenterRange <= 10;
      const isCompliant =
        inspection.columns === 6 &&
        inspection.rows === 3 &&
        inspection.fullBodyAllFrames &&
        inspection.idleRowFullBodyAllFrames &&
        inspection.idleRowLegsVisibleAllFrames &&
        inspection.idleRowNoCloseUpCrop &&
        inspection.cameraDistanceStable &&
        inspection.consistentScale &&
        inspection.uniformSpacing &&
        inspection.noTextOrUi &&
        inspection.idleRowBaselineStable &&
        inspection.idleRowPelvisStable &&
        inspection.runRowLegInterchangeClear &&
        inspection.runRowArmSwingVisible &&
        inspection.runRowArcadeSprintReadable &&
        !dividerArtifacts.hasDividerArtifacts &&
        idlePixelBaselineStable &&
        idlePixelCenterStable;

      if (isCompliant) {
        const thumbnailBuffer = await createThumbnail(processedBuffer);
        return {
          sheetBuffer: processedBuffer,
          thumbnailBuffer,
          width: 2048,
          height: 1152,
          animation: layoutAnalysis.animation,
        };
      }

      const failedChecks: string[] = [];
      if (inspection.columns !== 6 || inspection.rows !== 3) {
        failedChecks.push(
          `grid=${inspection.columns ?? 'unknown'}x${inspection.rows ?? 'unknown'} (must be 6x3)`
        );
      }
      if (!inspection.fullBodyAllFrames) failedChecks.push('full-body framing');
      if (!inspection.idleRowFullBodyAllFrames) {
        failedChecks.push('idle row full-body in all 6 frames');
      }
      if (!inspection.idleRowLegsVisibleAllFrames) {
        failedChecks.push('idle row legs/feet visibility in all 6 frames');
      }
      if (!inspection.idleRowNoCloseUpCrop) {
        failedChecks.push('idle row no close-up/bust/portrait crop');
      }
      if (!inspection.idleRowBaselineStable) {
        failedChecks.push('idle row feet locked to one baseline');
      }
      if (!inspection.idleRowPelvisStable) {
        failedChecks.push('idle row pelvis locked in place');
      }
      if (!inspection.cameraDistanceStable) {
        failedChecks.push('stable camera distance across rows');
      }
      if (!inspection.consistentScale) failedChecks.push('consistent character scale');
      if (!inspection.uniformSpacing) failedChecks.push('uniform cell spacing/alignment');
      if (!inspection.noTextOrUi) failedChecks.push('no text/UI artifacts');
      if (!inspection.runRowLegInterchangeClear) {
        failedChecks.push('clear run-row leg interchange');
      }
      if (!inspection.runRowArmSwingVisible) {
        failedChecks.push('visible run-row arm swing');
      }
      if (!inspection.runRowArcadeSprintReadable) {
        failedChecks.push('arcade sprint readability');
      }
      if (dividerArtifacts.hasDividerArtifacts) {
        failedChecks.push('no cell divider or grid line artifacts');
      }
      if (!idlePixelBaselineStable) failedChecks.push('pixel-detected idle baseline drift');
      if (!idlePixelCenterStable) failedChecks.push('pixel-detected idle pelvis drift');

      correction = buildRetryCorrection(failedChecks, attempt, maxAttempts);
    }

    throw new Error('Unable to generate a compliant 6x3 sprite sheet after multiple attempts.');
  }
}
