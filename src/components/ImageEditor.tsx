import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  defaultImageEdits,
  drawEditedImage,
  exportEditedImage,
  type ImageEdits,
  imageGeometry,
} from "@/lib/image-editor";

export function ImageEditor({
  file,
  busy,
  status,
  onUpload,
  onBack,
  onCancel,
  libraryOnlyInitial = false,
  libraryOnlyLocked = false,
}: {
  file: File;
  busy: boolean;
  status: string;
  onUpload: (file: File, libraryOnly: boolean) => Promise<void>;
  onBack: () => void;
  onCancel: () => void;
  libraryOnlyInitial?: boolean;
  libraryOnlyLocked?: boolean;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const widthId = useId();
  const [edits, setEdits] = useState<ImageEdits>({ ...defaultImageEdits });
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<File | null>(null);
  const [finalUrl, setFinalUrl] = useState("");
  const [libraryOnly, setLibraryOnly] = useState(libraryOnlyInitial);
  const active = useRef(true);
  const drag = useRef<{
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    active.current = true;
    const url = URL.createObjectURL(file);
    const next = new Image();
    next.onload = () => {
      if (!active.current) return;
      if (next.naturalWidth * next.naturalHeight > 24_000_000) {
        setError("Choose an image with at most 24 million pixels.");
        return;
      }
      setImage(next);
    };
    next.onerror = () => {
      if (active.current) setError("Cannot open this image. Try a JPEG, PNG, WebP or AVIF.");
    };
    next.src = url;
    return () => {
      active.current = false;
      next.onload = null;
      next.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(() => {
    if (!prepared) {
      setFinalUrl("");
      return;
    }
    const url = URL.createObjectURL(prepared);
    setFinalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);
  const geometry = image ? imageGeometry(image.naturalWidth, image.naturalHeight, edits) : null;
  const view = useMemo(() => {
    if (!image) return { source: "", result: "", error: "" };
    try {
      const source = drawEditedImage(
        image,
        { ...edits, x: 0, y: 0, cropWidth: 100, cropHeight: 100, width: 0 },
        900,
      );
      const result = drawEditedImage(image, edits, 900);
      const urls = { source: source.toDataURL(), result: result.toDataURL(), error: "" };
      source.width = source.height = result.width = result.height = 0;
      return urls;
    } catch (failure) {
      return { source: "", result: "", error: String(failure) };
    }
  }, [image, edits]);
  const change = (values: Partial<ImageEdits>) => {
    setEdits((current) => ({ ...current, ...values }));
    setPrepared(null);
    setError("");
  };
  const cropPreset = (ratio: number) => {
    if (!geometry) return;
    let width = geometry.fullWidth;
    let height = width / ratio;
    if (height > geometry.fullHeight) {
      height = geometry.fullHeight;
      width = height * ratio;
    }
    const cropWidth = (width / geometry.fullWidth) * 100;
    const cropHeight = (height / geometry.fullHeight) * 100;
    change({
      x: (100 - cropWidth) / 2,
      y: (100 - cropHeight) / 2,
      cropWidth,
      cropHeight,
      width: 0,
    });
  };
  async function prepare() {
    if (!image) return;
    setPreparing(true);
    setError("");
    try {
      const result = await exportEditedImage(image, file, edits);
      if (active.current) setPrepared(result);
    } catch (failure) {
      if (active.current)
        setError(failure instanceof Error ? failure.message : "Cannot prepare image.");
    } finally {
      if (active.current) setPreparing(false);
    }
  }
  return (
    <div className="space-y-4">
      <p className="break-all text-sm font-medium text-stone-700">{file.name}</p>
      {(error || view.error) && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error || view.error}
        </p>
      )}
      {!image && !error && <p role="status">Opening image…</p>}
      {image && geometry && !prepared && (
        <fieldset disabled={preparing || busy} className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="space-y-3">
            <p className="text-sm font-semibold">Crop & composition</p>
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border bg-stone-100 p-3">
              <div
                className="relative w-full select-none"
                style={{
                  maxWidth: Math.min(560, (280 * geometry.fullWidth) / geometry.fullHeight),
                }}
              >
                <img
                  src={view.source}
                  alt="Original composition"
                  className="block w-full"
                  draggable={false}
                />
                <div
                  className="absolute border-2 border-white bg-transparent shadow-[0_0_0_999px_#0006]"
                  style={{
                    left: `${edits.x}%`,
                    top: `${edits.y}%`,
                    width: `${edits.cropWidth}%`,
                    height: `${edits.cropHeight}%`,
                    touchAction: "none",
                    cursor: "move",
                  }}
                  onPointerDown={(event) => {
                    if (preparing || busy) return;
                    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
                    if (!bounds) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = {
                      clientX: event.clientX,
                      clientY: event.clientY,
                      x: edits.x,
                      y: edits.y,
                      width: bounds.width,
                      height: bounds.height,
                    };
                  }}
                  onPointerMove={(event) => {
                    const start = drag.current;
                    if (!start) return;
                    change({
                      x: Math.max(
                        0,
                        Math.min(
                          100 - edits.cropWidth,
                          start.x + ((event.clientX - start.clientX) / start.width) * 100,
                        ),
                      ),
                      y: Math.max(
                        0,
                        Math.min(
                          100 - edits.cropHeight,
                          start.y + ((event.clientY - start.clientY) / start.height) * 100,
                        ),
                      ),
                    });
                  }}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                  onLostPointerCapture={() => {
                    drag.current = null;
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-stone-500">
              Drag the crop area, or use the sliders to position it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => change({ x: 0, y: 0, cropWidth: 100, cropHeight: 100, width: 0 })}
              >
                Full image
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => cropPreset(1)}>
                Square
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => cropPreset(4 / 3)}>
                4:3
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => cropPreset(16 / 9)}>
                16:9
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  change({
                    rotation: (edits.rotation + 90) % 360,
                    x: 0,
                    y: 0,
                    cropWidth: 100,
                    cropHeight: 100,
                    width: 0,
                  })
                }
              >
                Rotate 90°
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={edits.flip}
                onClick={() => change({ flip: !edits.flip })}
              >
                Flip horizontal
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Slider
                label="Crop width"
                value={edits.cropWidth}
                min={5}
                max={100}
                onChange={(cropWidth) =>
                  change({ cropWidth, x: Math.min(edits.x, 100 - cropWidth), width: 0 })
                }
              />
              <Slider
                label="Crop height"
                value={edits.cropHeight}
                min={5}
                max={100}
                onChange={(cropHeight) =>
                  change({ cropHeight, y: Math.min(edits.y, 100 - cropHeight), width: 0 })
                }
              />
              <Slider
                label="Crop left"
                value={edits.x}
                min={0}
                max={100 - edits.cropWidth}
                onChange={(x) => change({ x })}
              />
              <Slider
                label="Crop top"
                value={edits.y}
                min={0}
                max={100 - edits.cropHeight}
                onChange={(y) => change({ y })}
              />
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-sm font-semibold">Adjustments</p>
            <Slider
              label="Brightness"
              value={edits.brightness}
              min={0}
              max={200}
              onChange={(brightness) => change({ brightness })}
            />
            <Slider
              label="Contrast"
              value={edits.contrast}
              min={0}
              max={200}
              onChange={(contrast) => change({ contrast })}
            />
            <Slider
              label="Saturation"
              value={edits.saturation}
              min={0}
              max={200}
              onChange={(saturation) => change({ saturation })}
            />
            <label htmlFor={widthId} className="block space-y-1 text-sm font-medium">
              Width (px)
              <Input
                id={widthId}
                type="number"
                min={1}
                max={geometry.cropWidth}
                value={geometry.outputWidth}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value))
                    change({ width: Math.max(1, Math.min(geometry.cropWidth, value)) });
                }}
              />
            </label>
            <p className="text-xs text-stone-500">
              Height: {geometry.outputHeight} px. Aspect ratio is kept; images are never enlarged.
            </p>
            <img
              src={view.result}
              alt="Live edited preview"
              className="max-h-36 w-full rounded-lg border bg-stone-100 object-contain"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => change({ ...defaultImageEdits })}
            >
              Reset edits
            </Button>
          </div>
        </fieldset>
      )}
      {prepared && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">Final preview</h3>
          <img
            src={finalUrl}
            alt="Final preview before upload"
            className="max-h-80 w-full rounded-xl border bg-stone-100 object-contain"
          />
          <p className="text-sm text-stone-600">
            {geometry?.outputWidth} × {geometry?.outputHeight} px ·{" "}
            {(prepared.size / 1024).toFixed(0)} KB
          </p>
          {!libraryOnlyLocked && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={libraryOnly}
                disabled={busy}
                onChange={(event) => setLibraryOnly(event.target.checked)}
              />
              Save to media library only
            </label>
          )}
          <p className="text-xs text-stone-500">
            Every upload is saved to your company’s library. Images may be optimized to fit their
            destination.
          </p>
        </div>
      )}
      {status && (
        <p role="status" aria-live="polite" className="text-sm text-stone-600">
          {status}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2 border-t border-pink-100 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={preparing}
          onClick={busy ? onCancel : prepared ? () => setPrepared(null) : onBack}
        >
          {busy ? "Cancel upload" : prepared ? "Back to editing" : "Choose another image"}
        </Button>
        {prepared ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void onUpload(prepared, libraryOnly)}
          >
            {busy ? "Uploading…" : libraryOnly ? "Upload to library" : "Upload & use image"}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!image || preparing || !!view.error}
            onClick={() => void prepare()}
          >
            {preparing ? "Preparing…" : "Preview image"}
          </Button>
        )}
      </div>
    </div>
  );
}
function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1 text-xs font-medium text-stone-600">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </span>
      <input
        className="block w-full accent-pink-700"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
