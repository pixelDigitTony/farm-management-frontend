export type ImageEdits = {
  rotation: number;
  flip: boolean;
  x: number;
  y: number;
  cropWidth: number;
  cropHeight: number;
  width: number;
  brightness: number;
  contrast: number;
  saturation: number;
};
export const defaultImageEdits: ImageEdits = {
  rotation: 0,
  flip: false,
  x: 0,
  y: 0,
  cropWidth: 100,
  cropHeight: 100,
  width: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
};
export function imageGeometry(width: number, height: number, edits: ImageEdits) {
  const rotated = edits.rotation % 180 !== 0;
  const fullWidth = rotated ? height : width;
  const fullHeight = rotated ? width : height;
  const x = Math.min(fullWidth - 1, Math.max(0, Math.round((fullWidth * edits.x) / 100)));
  const y = Math.min(fullHeight - 1, Math.max(0, Math.round((fullHeight * edits.y) / 100)));
  const cropWidth = Math.max(
    1,
    Math.min(fullWidth - x, Math.round((fullWidth * edits.cropWidth) / 100)),
  );
  const cropHeight = Math.max(
    1,
    Math.min(fullHeight - y, Math.round((fullHeight * edits.cropHeight) / 100)),
  );
  const outputWidth = Math.max(1, Math.min(cropWidth, Math.round(edits.width || cropWidth)));
  return {
    fullWidth,
    fullHeight,
    x,
    y,
    cropWidth,
    cropHeight,
    outputWidth,
    outputHeight: Math.max(1, Math.round((outputWidth * cropHeight) / cropWidth)),
  };
}

export function drawEditedImage(image: HTMLImageElement, edits: ImageEdits, maxEdge?: number) {
  const geometry = imageGeometry(image.naturalWidth, image.naturalHeight, edits);
  const rotated = document.createElement("canvas");
  // Preview uses a smaller intermediate canvas; full resolution is reserved for export.
  const scale = maxEdge
    ? Math.min(1, maxEdge / Math.max(geometry.fullWidth, geometry.fullHeight))
    : 1;
  rotated.width = Math.max(1, Math.round(geometry.fullWidth * scale));
  rotated.height = Math.max(1, Math.round(geometry.fullHeight * scale));
  const context = rotated.getContext("2d");
  if (!context) throw new Error("Your browser cannot edit images.");
  context.translate(rotated.width / 2, rotated.height / 2);
  context.scale(edits.flip ? -1 : 1, 1);
  context.rotate((edits.rotation * Math.PI) / 180);
  context.drawImage(
    image,
    (-image.naturalWidth * scale) / 2,
    (-image.naturalHeight * scale) / 2,
    image.naturalWidth * scale,
    image.naturalHeight * scale,
  );
  const canvas = document.createElement("canvas");
  const outputScale = maxEdge
    ? Math.min(1, maxEdge / Math.max(geometry.outputWidth, geometry.outputHeight))
    : 1;
  canvas.width = Math.max(1, Math.round(geometry.outputWidth * outputScale));
  canvas.height = Math.max(1, Math.round(geometry.outputHeight * outputScale));
  const output = canvas.getContext("2d");
  if (!output) throw new Error("Your browser cannot edit images.");
  if (
    !("filter" in output) &&
    [edits.brightness, edits.contrast, edits.saturation].some((value) => value !== 100)
  )
    throw new Error("Image adjustments are not supported in this browser. Try Chrome or Edge.");
  output.filter = `brightness(${edits.brightness}%) contrast(${edits.contrast}%) saturate(${edits.saturation}%)`;
  output.imageSmoothingQuality = "high";
  output.drawImage(
    rotated,
    geometry.x * scale,
    geometry.y * scale,
    geometry.cropWidth * scale,
    geometry.cropHeight * scale,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  rotated.width = rotated.height = 0;
  return canvas;
}

export async function exportEditedImage(image: HTMLImageElement, file: File, edits: ImageEdits) {
  // Preserve original bytes when the user only previews, leaving validation to the backend.
  if (JSON.stringify(edits) === JSON.stringify(defaultImageEdits)) return file;
  const canvas = drawEditedImage(image, edits);
  try {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Could not prepare this image."))),
        "image/png",
      ),
    );
    if (blob.size > 20 * 1024 * 1024)
      throw new Error("Edited image exceeds 20 MB. Reduce its width and try again.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-edited.png`, {
      type: "image/png",
    });
  } finally {
    canvas.width = canvas.height = 0;
  }
}
