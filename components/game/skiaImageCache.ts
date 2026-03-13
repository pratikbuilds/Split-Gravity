import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';
import { File, Directory, Paths } from 'expo-file-system';
import { Skia, type SkImage } from '@shopify/react-native-skia';

type SkiaImageSource = number | string;
const REMOTE_IMAGE_CACHE_DIR = new Directory(Paths.cache, 'skia-image-cache');

const getSourceCacheKey = (source: SkiaImageSource) =>
  typeof source === 'number' ? `module:${source}` : `uri:${source}`;

const getRemoteImageExtension = (uri: string) => {
  const pathname = uri.split('?')[0] ?? uri;
  const lastDot = pathname.lastIndexOf('.');
  if (lastDot === -1) return '.img';
  const extension = pathname.slice(lastDot);
  return extension.length > 10 ? '.img' : extension;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
};

const ensureRemoteImageFile = async (uri: string) => {
  if (!REMOTE_IMAGE_CACHE_DIR.exists) {
    REMOTE_IMAGE_CACHE_DIR.create({ idempotent: true, intermediates: true });
  }

  const file = new File(
    REMOTE_IMAGE_CACHE_DIR,
    `${hashString(uri)}${getRemoteImageExtension(uri)}`
  );
  if (!file.exists) {
    await File.downloadFileAsync(uri, file, { idempotent: true });
  }
  return file.uri;
};

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
    uri = source.startsWith('http://') || source.startsWith('https://')
      ? await ensureRemoteImageFile(source)
      : source;
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
    source == null ? null : (decodedImageCache.get(getSourceCacheKey(source)) ?? null)
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
