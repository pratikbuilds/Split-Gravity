import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../../../config/env';
import type { CharacterGenerationSourceType } from '../../../shared/character-generation-contracts';
import { applyMagentaTransparency, createThumbnail } from './imageProcessing';

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
  runRowNatural: boolean;
};

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
          text: 'Validate this sprite sheet. Return JSON only with columns, rows, fullBodyAllFrames, idleRowFullBodyAllFrames, idleRowLegsVisibleAllFrames, idleRowNoCloseUpCrop, cameraDistanceStable, consistentScale, uniformSpacing, noTextOrUi, runRowNatural.',
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
          runRowNatural: { type: Type.BOOLEAN },
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
      runRowNatural: parsed.runRowNatural === true,
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
      runRowNatural: false,
    };
  }
};

const buildPrompt = (prompt: string | null, sourceType: CharacterGenerationSourceType) => {
  const subject = prompt?.trim() || 'reference character';
  const referenceLine =
    sourceType === 'image'
      ? 'Preserve the uploaded character identity exactly across every frame.'
      : 'Create an original readable character design.';

  return `Create one 6x3 sprite sheet image for a side-scrolling gravity jump game.
SUBJECT: ${subject}
${referenceLine}
Rules:
- Exactly 6 columns x 3 rows, row order RUN, JUMP, IDLE.
- Every frame full body from head to feet.
- Background must be flat #FF00FF only.
- No text, UI, borders, grid lines, logos, or watermark.
- Keep framing and character scale consistent across all 18 frames.
- Run row is a readable 6-frame sprint cycle.
- Jump row is launch, ascent, peak, descent, landing, recovery.
- Idle row is subtle breathing only, no stepping.
Return only the final image.`;
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

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
        { text: buildPrompt(prompt, sourceType) },
      ];

      if (referenceImageDataUrl) {
        const { mimeType, data } = parseDataUrlImage(referenceImageDataUrl);
        parts.push({ inlineData: { mimeType, data } });
      }

      if (correction) {
        parts.push({ text: correction });
      }

      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
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
      const processedBuffer = applyMagentaTransparency(rawBuffer);
      const processedDataUrl = `data:image/png;base64,${processedBuffer.toString('base64')}`;
      const inspection = await inspectSpriteSheetGrid(this.client, processedDataUrl);
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
        inspection.runRowNatural;

      if (isCompliant) {
        const thumbnailBuffer = await createThumbnail(processedBuffer);
        return {
          sheetBuffer: processedBuffer,
          thumbnailBuffer,
          width: 2048,
          height: 1152,
        };
      }

      correction = `Retry ${attempt}/${maxAttempts}: previous result violated grid or framing rules. Regenerate from scratch with exact 6x3 layout, stable framing, full-body cells, and no UI artifacts.`;
    }

    throw new Error('Unable to generate a compliant 6x3 sprite sheet after multiple attempts.');
  }
}
