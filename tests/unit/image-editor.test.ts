import { expect, it } from "vitest";
import { defaultImageEdits, imageGeometry } from "@/lib/image-editor";

it("rotates before cropping and keeps resized output in proportion without enlargement", () => {
  expect(
    imageGeometry(800, 600, {
      ...defaultImageEdits,
      rotation: 90,
      cropWidth: 50,
      cropHeight: 50,
      width: 150,
    }),
  ).toMatchObject({
    fullWidth: 600,
    fullHeight: 800,
    cropWidth: 300,
    cropHeight: 400,
    outputWidth: 150,
    outputHeight: 200,
  });
  expect(imageGeometry(800, 600, { ...defaultImageEdits, width: 1600 })).toMatchObject({
    outputWidth: 800,
    outputHeight: 600,
  });
});
it("keeps crop rectangles inside the source even at rounded boundaries", () => {
  const result = imageGeometry(101, 79, {
    ...defaultImageEdits,
    x: 98,
    y: 99,
    cropWidth: 50,
    cropHeight: 50,
  });
  expect(result.x + result.cropWidth).toBeLessThanOrEqual(101);
  expect(result.y + result.cropHeight).toBeLessThanOrEqual(79);
  expect(result.outputHeight).toBeGreaterThanOrEqual(1);
});
