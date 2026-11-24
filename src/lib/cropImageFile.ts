import { normaliseTurns, rotateSize, type CropRect } from "@/lib/imageCrop";

/**
 * Turning a crop rectangle into a file that can be uploaded.
 *
 * The canvas half of cropping, kept apart from the geometry in imageCrop.ts
 * and shaped after src/lib/compareImage.ts, which already does this work for
 * the before/after export.
 */

/**
 * Load a File into an Image.
 *
 * Through an object URL, and revoked afterwards: a ten-megapixel phone photo
 * held open is ten megabytes the tab never gets back.
 */
export async function loadImageFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      // An iPhone .heic chosen from Files is the real case: the browser
      // cannot decode it, so there is nothing to crop. The caller keeps the
      // original file - cropping is an improvement, never a gate on the
      // upload.
      img.onerror = () => reject(new Error("This picture could not be opened for cropping"));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * PNG stays PNG; everything else becomes JPEG.
 *
 * A photographed page saved as PNG is several times the size for no gain, and
 * a screenshot of typed text saved as JPEG picks up artefacts around the
 * letters. Keeping PNG where it came in is the only rule that avoids both.
 */
export function outputType(file: File): "image/png" | "image/jpeg" {
  return /\.png$/i.test(file.name) || file.type === "image/png" ? "image/png" : "image/jpeg";
}

/** The name it keeps, with the suffix matching what was actually written. */
export function outputName(fileName: string, type: string): string {
  const suffix = type === "image/png" ? "png" : "jpg";
  const base = fileName.replace(/\.[^./\\]*$/, "") || "attachment";
  return `${base}.${suffix}`;
}

export const JPEG_QUALITY = 0.92;

/**
 * Crop (and turn) a picture, giving back a File ready for the same upload
 * path an untouched one takes.
 *
 * The rectangle is in the ORIGINAL picture's pixels, before any rotation -
 * that is what the dialog draws against - so the canvas is turned and the
 * source offsets are applied in the original's frame of reference.
 */
export async function cropImageFile(file: File, rect: CropRect, turns = 0): Promise<File> {
  const img = await loadImageFile(file);
  const quarter = normaliseTurns(turns);

  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const size = rotateSize(width, height, quarter);

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the picture");

  ctx.save();
  // Turn about the middle of the finished picture, then draw the crop
  // centred on it: the same two lines work for all four turns.
  ctx.translate(size.width / 2, size.height / 2);
  ctx.rotate((quarter * Math.PI) / 2);
  ctx.drawImage(
    img,
    Math.round(rect.x), Math.round(rect.y), width, height,
    -width / 2, -height / 2, width, height,
  );
  ctx.restore();

  const type = outputType(file);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, type === "image/jpeg" ? JPEG_QUALITY : undefined),
  );
  if (!blob) throw new Error("The cropped picture could not be saved");

  return new File([blob], outputName(file.name, type), { type });
}
