import { z } from 'zod';

export const createCharacterGenerationJobSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000).optional(),
    displayName: z.string().trim().min(1).max(64).optional(),
    referenceImageDataUrl: z.string().startsWith('data:image/').max(15_000_000).optional(),
    paymentIntentId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.prompt || value.referenceImageDataUrl), {
    message: 'A prompt or reference image is required.',
    path: ['prompt'],
  });

export const renameCustomCharacterSchema = z.object({
  displayName: z.string().trim().min(1).max(64),
});

export const registerExpoPushTokenSchema = z.object({
  expoPushToken: z.string().min(8),
  platform: z.enum(['ios', 'android']),
});
