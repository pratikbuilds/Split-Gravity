import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';
import { Skia, type SkImage } from '@shopify/react-native-skia';

const decodedImageCache = new Map<number, SkImage>();
const decodePromiseCache = new Map<number, Promise<SkImage | null>>();

async function decodeSkiaImage(source: number): Promise<SkImage | null> {
  const asset = Asset.fromModule(source);
  if (!asset.downloaded) {
    await asset.downloadAsync();
  }

  const uri = asset.localUri ?? asset.uri;
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (image) {
    decodedImageCache.set(source, image);
  }
  return image;
}

function ensureSkiaImage(source: number): Promise<SkImage | null> {
  const cachedImage = decodedImageCache.get(source);
  if (cachedImage) {
    return Promise.resolve(cachedImage);
  }

  const pending = decodePromiseCache.get(source);
  if (pending) {
    return pending;
  }

  const promise = decodeSkiaImage(source)
    .catch((error) => {
      console.warn('Skia image preload failed:', error);
      return null;
    })
    .finally(() => {
      decodePromiseCache.delete(source);
    });

  decodePromiseCache.set(source, promise);
  return promise;
}

export function preloadSkiaImages(sources: readonly number[]): Promise<void> {
  const uniqueSources = Array.from(new Set(sources));
  return Promise.all(uniqueSources.map((source) => ensureSkiaImage(source))).then(() => undefined);
}

export function useSkiaImageAsset(source: number | null | undefined): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(() =>
    source == null ? null : decodedImageCache.get(source) ?? null
  );

  useEffect(() => {
    if (source == null) {
      setImage(null);
      return;
    }

    const cachedImage = decodedImageCache.get(source) ?? null;
    setImage(cachedImage);
    if (cachedImage) {
      return;
    }

    let cancelled = false;
    void ensureSkiaImage(source).then((nextImage) => {
      if (!cancelled) {
        setImage(nextImage);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [source]);

  return image;
}
