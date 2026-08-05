import sharp from 'sharp';

const CONTENT_TYPE_FORMAT = new Map<string, string>([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_INPUT_PIXELS = 40_000_000;

export class InvalidImageUploadError extends Error {}

interface NormalizeImageOptions {
  maxBytes: number;
  maxDimension: number;
}

export interface NormalizedImage {
  contentType: 'image/webp';
  data: Buffer;
}

function decodeBase64Strict(value: string): Buffer {
  if (!value || !STRICT_BASE64.test(value)) {
    throw new InvalidImageUploadError('Invalid base64 image payload');
  }
  const data = Buffer.from(value, 'base64');
  const canonicalInput = value.replace(/=+$/, '');
  if (!data.byteLength || data.toString('base64').replace(/=+$/, '') !== canonicalInput) {
    throw new InvalidImageUploadError('Invalid base64 image payload');
  }
  return data;
}

export async function normalizeImageUpload(
  contentType: string,
  dataBase64: string,
  options: NormalizeImageOptions,
): Promise<NormalizedImage> {
  const expectedFormat = CONTENT_TYPE_FORMAT.get(contentType);
  if (!expectedFormat) throw new InvalidImageUploadError('Unsupported image type');

  const input = decodeBase64Strict(dataBase64);
  if (input.byteLength > options.maxBytes) {
    throw new InvalidImageUploadError('Image is too large');
  }

  try {
    const metadata = await sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    if (
      metadata.format !== expectedFormat ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new InvalidImageUploadError('Image content does not match its declared type');
    }

    const data = await sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        fit: 'inside',
        height: options.maxDimension,
        width: options.maxDimension,
        withoutEnlargement: true,
      })
      .webp({ effort: 4, quality: 82 })
      .toBuffer();

    if (!data.byteLength || data.byteLength > options.maxBytes) {
      throw new InvalidImageUploadError('Normalized image is too large');
    }
    return { contentType: 'image/webp', data };
  } catch (error) {
    if (error instanceof InvalidImageUploadError) throw error;
    throw new InvalidImageUploadError('Invalid or unsafe image content');
  }
}
