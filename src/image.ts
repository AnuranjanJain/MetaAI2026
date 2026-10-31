// Shared image-upload helpers for views: validate a file, then downscale it
// to a JPEG data URL so local persistence (a single localStorage JSON)
// stays light. Callers pick maxDim/quality; stored sizes don't change
// silently when a new call site appears.

const MAX_BYTES = 8 * 1024 * 1024;

/** Returns a user-facing error, or null when the file is acceptable. */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'That file is not an image.';
  if (file.size > MAX_BYTES) return 'That image is too large (over 8 MB).';
  return null;
}

/** Downscale an image file to a JPEG data URL. Rejects when unreadable. */
export function readImageDataUrl(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<string> {
  const maxDim = opts.maxDim ?? 800;
  const quality = opts.quality ?? 0.72;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}
