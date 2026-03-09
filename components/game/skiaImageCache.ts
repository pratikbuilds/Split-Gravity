import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';
import { Skia, type SkImage } from '@shopify/react-native-skia';

type SkiaImageSource = number | string;

const getSourceCacheKey = (source: SkiaImageSource) =>
  typeof source === 'number' ? `module:${source}` : `uri:${source}`;

const decodedImageCache = new Map<string, SkImage>();
const decodePromiseCache = new Map<string, Promise<SkImage | null>>();

async function decodeSkiaImage(source: SkiaImageSource): Promise<SkImage | null> {
  let uri: string;

  if (typeof source === 'number') {
    const asset = Asset.fromModule(source);
    if (!asset.downloaded) {
      await asset.downloadAsync();
    }
    uri = asset.localUri ?? asset.uri;
  } else {
    uri = source;
  }

  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (image) {
    decodedImageCache.set(getSourceCacheKey(source), image);
  }
  return image;
}

function ensureSkiaImage(source: SkiaImageSource): Promise<SkImage | null> {
  const cacheKey = getSourceCacheKey(source);
  const cachedImage = decodedImageCache.get(cacheKey);
  if (cachedImage) {
    return Promise.resolve(cachedImage);
  }

  const pending = decodePromiseCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = decodeSkiaImage(source)
    .catch((error) => {
      console.warn('Skia image preload failed:', error);
      return null;
    })
    .finally(() => {
      decodePromiseCache.delete(cacheKey);
    });

  decodePromiseCache.set(cacheKey, promise);
  return promise;
}

export function preloadSkiaImages(sources: readonly SkiaImageSource[]): Promise<void> {
  const uniqueSources = Array.from(new Set(sources));
  return Promise.all(uniqueSources.map((source) => ensureSkiaImage(source))).then(() => undefined);
}

export function useSkiaImageAsset(source: SkiaImageSource | null | undefined): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(() =>
    source == null ? null : decodedImageCache.get(getSourceCacheKey(source)) ?? null
  );

  useEffect(() => {
    if (source == null) {
      setImage(null);
      return;
    }

    const cachedImage = decodedImageCache.get(getSourceCacheKey(source)) ?? null;
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
