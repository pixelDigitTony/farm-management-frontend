import { useState } from "react";
import { ImageUpload } from "@/components/ImageUpload";
import pack from "@/lib/landing-page/assets.json";
import { blockRegistry } from "@/lib/landing-page/registry";
import type {
  BackgroundSettings,
  LandingCatalogItem,
  LandingPageComponent,
  LandingPageSection,
  LandingPageVariant,
  MediaAsset,
} from "@/types/landing-page";

const fieldName = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
const textLimits: Record<string, number> = {
  title: 120,
  heading: 120,
  eyebrow: 80,
  body: 2000,
  brand: 120,
  tagline: 120,
  quote: 600,
  author: 100,
  missionText: 300,
  legal: 300,
  statement: 300,
  question: 200,
  answer: 1000,
  alt: 300,
  label: 40,
  caption: 300,
  primaryLabel: 40,
  secondaryLabel: 40,
  buttonLabel: 40,
  address: 300,
  phone: 40,
  email: 160,
  hours: 300,
};
const options: Record<string, string[]> = {
  alignment: ["LEFT", "CENTER", "RIGHT"],
  displayMode: ["VERTICAL", "HORIZONTAL"],
  icon: ["leaf", "shield", "truck", "wallet", "pin", "shirt", "package", "heart", "home", "star"],
  aspectRatio: ["AUTO", "SQUARE", "PORTRAIT", "LANDSCAPE", "WIDE"],
  depth: ["BACKGROUND", "SUBJECT", "FOREGROUND"],
  panelPlacement: ["OVERLAP", "BELOW"],
  orderPresentation: ["DEFAULT", "INLINE_SUMMARY"],
  cardLayout: ["STANDARD", "COMPACT", "BOUTIQUE"],
  preset: ["NONE", "REVEAL", "PARALLAX", "IMAGE_REVEAL", "STICKY_STORY"],
  intensity: ["SUBTLE", "STANDARD"],
  mobile: ["STATIC", "SUBTLE"],
};
export function InspectorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Every caller supplies its form control as children, nested inside this label.
    <label className="lb-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function InspectorSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string | number | undefined;
  values: readonly (string | number)[];
  onChange: (value: string) => void;
}) {
  return (
    <InspectorField label={label}>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {values.map((v) => (
          <option key={v} value={v}>
            {fieldName(String(v).toLowerCase())}
          </option>
        ))}
      </select>
    </InspectorField>
  );
}
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <InspectorField label={label}>
      <div className="lb-color">
        <input
          aria-label={`${label} picker`}
          type="color"
          value={/^#[a-f0-9]{6}$/i.test(value) ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          aria-label={`${label} hex`}
          value={value}
          maxLength={7}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </InspectorField>
  );
}
export function MediaField({
  label,
  media,
  onChange,
}: {
  label: string;
  media?: MediaAsset;
  onChange: (media: MediaAsset | undefined) => void;
}) {
  const ready = (url: string) =>
    onChange({
      ...media,
      url,
      alt: media?.alt ?? "",
      focalPoint: media?.focalPoint ?? { x: 0.5, y: 0.5 },
      aspectRatio: media?.aspectRatio ?? "AUTO",
    });
  return (
    <fieldset className="lb-media-field">
      <legend>{label}</legend>
      {media && <img src={media.url} alt={media.alt} />}
      <ImageUpload scope="landing-page" selection={media?.url ?? ""} onReady={ready} />
      <InspectorField label={`${label} URL`}>
        <input
          value={media?.url ?? ""}
          placeholder="HTTPS or stored image URL"
          onChange={(e) => (e.target.value ? ready(e.target.value) : onChange(undefined))}
        />
      </InspectorField>
      <InspectorField label="Use a sample asset">
        <select
          value=""
          onChange={(e) => {
            const selected = Object.values(pack.assets).find((a) => a.url === e.target.value);
            if (selected)
              onChange({
                url: selected.url,
                alt: selected.alt,
                focalPoint: selected.focalPoint,
                aspectRatio: "AUTO",
              });
          }}
        >
          <option value="">Choose an asset</option>
          {Object.entries(pack.assets).map(([id, a]) => (
            <option key={id} value={a.url}>
              {fieldName(id.replaceAll("-", " "))}
            </option>
          ))}
        </select>
      </InspectorField>
      {media && (
        <>
          <InspectorField label="Alternative text">
            <input
              maxLength={300}
              value={media.alt}
              onChange={(e) => onChange({ ...media, alt: e.target.value })}
            />
          </InspectorField>
          <InspectorField label="Mobile image URL (optional)">
            <input
              value={media.mobileUrl ?? ""}
              onChange={(e) => onChange({ ...media, mobileUrl: e.target.value || undefined })}
            />
          </InspectorField>
          <InspectorSelect
            label="Image ratio"
            value={media.aspectRatio}
            values={options.aspectRatio!}
            onChange={(v) => onChange({ ...media, aspectRatio: v as MediaAsset["aspectRatio"] })}
          />
          {(["x", "y"] as const).map((axis) => (
            <InspectorField
              key={axis}
              label={`Focal point ${axis === "x" ? "horizontal" : "vertical"}`}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={media.focalPoint[axis]}
                onChange={(e) =>
                  onChange({
                    ...media,
                    focalPoint: { ...media.focalPoint, [axis]: Number(e.target.value) },
                  })
                }
              />
            </InspectorField>
          ))}
          <button type="button" className="lb-text-button" onClick={() => onChange(undefined)}>
            Remove image
          </button>
        </>
      )}
    </fieldset>
  );
}
export function BackgroundInspector({
  value,
  inherit = true,
  onChange,
  templateId,
  color,
}: {
  value?: BackgroundSettings;
  inherit?: boolean;
  onChange: (v: BackgroundSettings | undefined) => void;
  templateId?: string;
  color: string;
}) {
  const sceneId =
    (
      {
        "bold-market": "market-background",
        "editorial-studio": "studio-background",
        "architectural-escape": "haven-scenery",
        "everyday-boutique": "boutique-background",
        "farm-and-market": "farm-scenery",
      } as Record<string, string>
    )[templateId ?? ""] ?? "market-background";
  const current = value ?? { mode: "COLOR", color };
  const scene = current.threeD?.sceneId ?? sceneId;
  const selected = pack.scenes.find((s) => s.id === scene);
  const update = (next: Partial<BackgroundSettings>) => onChange({ ...current, ...next });
  const threeD = current.threeD ?? {
    sceneId: sceneId as NonNullable<BackgroundSettings["threeD"]>["sceneId"],
    sceneRevision: 1,
    cameraPreset: "DESKTOP",
    motion: "SUBTLE",
    overlayOpacity: 0.25,
  };
  return (
    <fieldset className="lb-inspector-group">
      <legend>Background</legend>
      <fieldset className="lb-segment" aria-label="Background mode">
        {(["THREE_D", "IMAGE", "COLOR"] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            aria-pressed={current.mode === mode}
            onClick={() => update({ mode, ...(mode === "THREE_D" ? { threeD } : {}) })}
          >
            {mode === "THREE_D" ? "3D" : fieldName(mode.toLowerCase())}
          </button>
        ))}
      </fieldset>
      <ColorField
        label="Fallback color"
        value={current.color}
        onChange={(color) => update({ color })}
      />
      {current.mode === "THREE_D" && (
        <>
          <InspectorField label="3D scene">
            <select
              value={scene}
              onChange={(e) =>
                update({ threeD: { ...threeD, sceneId: e.target.value as typeof threeD.sceneId } })
              }
            >
              {pack.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {fieldName(s.id.replaceAll("-", " "))}
                </option>
              ))}
            </select>
          </InspectorField>
          {selected && (
            <img
              className="lb-scene-poster"
              src={selected.poster}
              alt="Selected background preview"
            />
          )}
          <InspectorSelect
            label="Camera preview"
            value={threeD.cameraPreset}
            values={["DESKTOP", "MOBILE"]}
            onChange={(v) =>
              update({ threeD: { ...threeD, cameraPreset: v as "DESKTOP" | "MOBILE" } })
            }
          />
          <label className="lb-checkbox">
            <input
              type="checkbox"
              checked={threeD.motion === "SUBTLE"}
              onChange={(e) =>
                update({ threeD: { ...threeD, motion: e.target.checked ? "SUBTLE" : "OFF" } })
              }
            />
            Subtle background movement
          </label>
          <InspectorField label="Contrast overlay">
            <input
              type="range"
              min={0}
              max={0.75}
              step={0.01}
              value={threeD.overlayOpacity}
              onChange={(e) =>
                update({ threeD: { ...threeD, overlayOpacity: Number(e.target.value) } })
              }
            />
          </InspectorField>
        </>
      )}
      {current.mode === "IMAGE" && (
        <MediaField
          label="Background image"
          media={current.image}
          onChange={(image) => update({ image })}
        />
      )}
      <button
        type="button"
        className="lb-text-button"
        onClick={() =>
          onChange(
            inherit
              ? undefined
              : {
                  mode: "THREE_D",
                  color,
                  threeD: {
                    sceneId: sceneId as NonNullable<BackgroundSettings["threeD"]>["sceneId"],
                    sceneRevision: 1,
                    cameraPreset: "DESKTOP",
                    motion: "SUBTLE",
                    overlayOpacity:
                      templateId === "architectural-escape" || templateId === "farm-and-market"
                        ? 0.3
                        : 0,
                  },
                },
          )
        }
      >
        {inherit ? "Reset background to inherited style" : "Reset background to template default"}
      </button>
    </fieldset>
  );
}
type EditorContext = {
  sections: LandingPageSection[];
  catalog: LandingCatalogItem[];
  blockType: LandingPageComponent["type"];
  layout?: string;
  v2?: boolean;
};
function newItem(key: string, ctx: EditorContext): unknown {
  const id = crypto.randomUUID();
  const section =
    ctx.sections.find((s) => s.enabled && s.components.some((c) => c.type === "CONTACT")) ??
    ctx.sections[0];
  const action = { label: "Explore", target: { kind: "SECTION", sectionId: section?.id ?? "" } };
  if (key === "navigation" || key === "links" || key === "actions") return action;
  if (key === "attributes") return { label: "Detail", value: "" };
  if (key === "entries") return { id, quote: "", author: "", enabled: true };
  if (ctx.blockType === "FEATURES") return { id, icon: "leaf", title: "New feature", body: "" };
  if (ctx.blockType === "FAQ") return { id, question: "Your question", answer: "Your answer" };
  if (ctx.blockType === "SHOWCASE")
    return { id, title: "New offering", body: "", attributes: [], actions: [] };
  return "";
}
function StructuredFields({
  value,
  onChange,
  ctx,
  path = "",
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  ctx: EditorContext;
  path?: string;
}) {
  const change = (key: string, item: unknown) => onChange({ ...value, [key]: item });
  const arrayEntry = /\.(items|entries|frames)\.\d+$/.test(path);
  const mediaKey = !ctx.v2
    ? undefined
    : !path && ctx.blockType === "HEADER"
      ? "logo"
      : !path && ctx.blockType === "HERO"
        ? "media"
        : arrayEntry && ctx.blockType === "SHOWCASE"
          ? "media"
          : arrayEntry && ctx.blockType === "TESTIMONIALS"
            ? "thumbnail"
            : undefined;
  const hasCatalogBinding =
    arrayEntry && (ctx.blockType === "MEDIA_STORY" || ctx.blockType === "TESTIMONIALS");
  const optionalAction =
    (!path && (ctx.blockType === "HEADER" || ctx.blockType === "MEDIA_STORY")) ||
    (arrayEntry && ctx.blockType === "FEATURES");
  const rating = arrayEntry && ctx.blockType === "TESTIMONIALS";
  if (value.kind === "SECTION" || value.kind === "LINK")
    return (
      <div className="lb-action-target">
        <InspectorSelect
          label="Destination"
          value={String(value.kind)}
          values={["SECTION", "LINK"]}
          onChange={(kind) =>
            onChange(
              kind === "SECTION"
                ? { kind, sectionId: ctx.sections[0]?.id ?? "" }
                : { kind, url: "" },
            )
          }
        />
        {value.kind === "SECTION" ? (
          <InspectorField label="Target section">
            <select
              value={String(value.sectionId)}
              onChange={(e) => change("sectionId", e.target.value)}
            >
              {ctx.sections
                .filter((s) => s.enabled)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </InspectorField>
        ) : (
          <InspectorField label="Link URL">
            <input
              value={String(value.url ?? "")}
              onChange={(e) => change("url", e.target.value)}
            />
          </InspectorField>
        )}
      </div>
    );
  return (
    <>
      {mediaKey && (
        <MediaField
          label={fieldName(mediaKey)}
          media={value[mediaKey] as MediaAsset | undefined}
          onChange={(m) => change(mediaKey, m)}
        />
      )}{" "}
      {hasCatalogBinding && (
        <InspectorField label="Related catalog item">
          <select
            value={
              value.catalogRef
                ? `${(value.catalogRef as { sourceType: string }).sourceType}:${(value.catalogRef as { sourceId: string }).sourceId}`
                : ""
            }
            onChange={(e) => {
              const item = ctx.catalog.find((c) => c.key === e.target.value);
              change(
                "catalogRef",
                item ? { sourceType: item.sourceType, sourceId: item.sourceId } : undefined,
              );
            }}
          >
            <option value="">No related item</option>
            {ctx.catalog.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </InspectorField>
      )}
      {rating && (
        <label className="lb-checkbox">
          <input
            type="checkbox"
            checked={value.rating !== undefined}
            onChange={(e) => change("rating", e.target.checked ? 5 : undefined)}
          />
          Include a merchant-provided rating
        </label>
      )}
      {optionalAction && !value.action && (
        <button
          type="button"
          className="lb-add-button"
          onClick={() => change("action", newItem("actions", ctx))}
        >
          + Add action
        </button>
      )}
      {optionalAction && Boolean(value.action) && (
        <button
          type="button"
          className="lb-text-button"
          onClick={() => change("action", undefined)}
        >
          Remove action
        </button>
      )}
      {Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "id",
              "focalPoint",
              "sourceType",
              "sourceId",
              ...(mediaKey ? [mediaKey] : []),
              ...(hasCatalogBinding ? ["catalogRef"] : []),
              ...(path === "motion" ? ["preset"] : []),
            ].includes(key),
        )
        .map(([key, item]) => {
          const label = fieldName(key);
          if (typeof item === "boolean")
            return (
              <label key={key} className="lb-checkbox">
                <input
                  type="checkbox"
                  checked={item}
                  onChange={(e) => change(key, e.target.checked)}
                />
                {label}
              </label>
            );
          if (typeof item === "number")
            return (
              <InspectorField key={key} label={label}>
                <input
                  type="number"
                  value={item}
                  min={
                    key === "durationMs" ? 150 : key === "rating" ? 1 : key === "columns" ? 2 : 0
                  }
                  max={
                    key === "durationMs" ? 900 : key === "rating" ? 5 : key === "columns" ? 4 : 99
                  }
                  step={key === "durationMs" ? 50 : key === "rating" ? 0.5 : 1}
                  onChange={(e) => change(key, Number(e.target.value))}
                />
              </InspectorField>
            );
          if (typeof item === "string") {
            if (key === "mediaUrl" && !ctx.v2)
              return (
                <div key={key}>
                  <ImageUpload
                    scope="landing-page"
                    selection={item}
                    onReady={(url) => change(key, url)}
                  />
                  <InspectorField label={label}>
                    <input
                      value={item}
                      maxLength={1000}
                      onChange={(e) => change(key, e.target.value)}
                    />
                  </InspectorField>
                </div>
              );
            if (options[key])
              return (
                <InspectorSelect
                  key={key}
                  label={label}
                  value={item}
                  values={
                    key === "displayMode" && ctx.blockType === "TESTIMONIALS"
                      ? ["RAIL", "GRID"]
                      : options[key]!
                  }
                  onChange={(v) => change(key, v)}
                />
              );
            const multiline = [
              "body",
              "quote",
              "answer",
              "missionText",
              "statement",
              "legal",
              "hours",
            ].includes(key);
            return (
              <InspectorField key={key} label={label}>
                {multiline ? (
                  <textarea
                    rows={4}
                    value={item}
                    maxLength={textLimits[key] ?? 2000}
                    onChange={(e) => change(key, e.target.value)}
                  />
                ) : (
                  <input
                    value={item}
                    maxLength={textLimits[key] ?? 1000}
                    onChange={(e) => change(key, e.target.value)}
                  />
                )}
              </InspectorField>
            );
          }
          if (Array.isArray(item)) {
            if (key === "catalogItemRefs" || key === "menuItemIds")
              return (
                <fieldset key={key} className="lb-inspector-group">
                  <legend>Catalog binding</legend>
                  <p className="lb-help">
                    Choose business-owned items. An empty selection shows the available collection.
                  </p>
                  {ctx.catalog
                    .filter((c) => key !== "menuItemIds" || c.sourceType === "MENU_ITEM")
                    .map((c) => {
                      const checked =
                        key === "menuItemIds"
                          ? item.includes(c.sourceId)
                          : item.some(
                              (r) => r.sourceType === c.sourceType && r.sourceId === c.sourceId,
                            );
                      return (
                        <label key={c.key} className="lb-checkbox">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const entry =
                                key === "menuItemIds"
                                  ? c.sourceId
                                  : { sourceType: c.sourceType, sourceId: c.sourceId };
                              change(
                                key,
                                checked
                                  ? item.filter((r) =>
                                      key === "menuItemIds"
                                        ? r !== c.sourceId
                                        : !(
                                            r.sourceType === c.sourceType &&
                                            r.sourceId === c.sourceId
                                          ),
                                    )
                                  : [...item, entry].slice(0, key === "menuItemIds" ? 12 : 24),
                              );
                            }}
                          />
                          {c.name}
                        </label>
                      );
                    })}
                </fieldset>
              );
            const mediaArray = ["stripMedia", "media", "frames", "layers"].includes(key);
            const maximum =
              key === "stripMedia" || key === "frames"
                ? 4
                : key === "layers"
                  ? 5
                  : key === "entries" || key === "mediaUrls" || key === "media"
                    ? 12
                    : key === "items" && ctx.blockType === "FAQ"
                      ? 10
                      : key === "items" && ctx.blockType === "SHOWCASE"
                        ? ctx.layout === "OFFERING_PATHS"
                          ? 6
                          : 12
                        : key === "attributes"
                          ? 6
                          : key === "actions"
                            ? 2
                            : 8;
            return (
              <fieldset key={key} className="lb-inspector-group">
                <legend>
                  {label} ({item.length}/{maximum})
                </legend>
                {item.map((entry, index) => (
                  <div
                    key={typeof entry === "object" && entry?.id ? entry.id : index}
                    className="lb-array-item"
                  >
                    <div className="lb-array-controls">
                      <span>{index + 1}</span>
                      <button
                        type="button"
                        aria-label={`Move ${label} ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => {
                          const copy = [...item];
                          [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
                          change(key, copy);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${label} ${index + 1} down`}
                        disabled={index === item.length - 1}
                        onClick={() => {
                          const copy = [...item];
                          [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]];
                          change(key, copy);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${label} ${index + 1}`}
                        onClick={() =>
                          change(
                            key,
                            item.filter((_, i) => i !== index),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                    {typeof entry === "object" && entry !== null ? (
                      entry.url !== undefined ? (
                        <MediaField
                          label={`${label} ${index + 1}`}
                          media={entry as MediaAsset}
                          onChange={(m) =>
                            change(
                              key,
                              m
                                ? item.map((e, i) => (i === index ? m : e))
                                : item.filter((_, i) => i !== index),
                            )
                          }
                        />
                      ) : (
                        <StructuredFields
                          value={entry}
                          ctx={ctx}
                          path={`${path}.${key}.${index}`}
                          onChange={(next) =>
                            change(
                              key,
                              item.map((e, i) => (i === index ? next : e)),
                            )
                          }
                        />
                      )
                    ) : (
                      <input
                        aria-label={`${label} ${index + 1}`}
                        value={String(entry)}
                        onChange={(e) =>
                          change(
                            key,
                            item.map((v, i) => (i === index ? e.target.value : v)),
                          )
                        }
                      />
                    )}
                  </div>
                ))}
                {item.length < maximum &&
                  (mediaArray ? (
                    <MediaField
                      label={`Add ${label}`}
                      onChange={(m) => {
                        if (m)
                          change(key, [
                            ...item,
                            key === "frames"
                              ? { id: crypto.randomUUID(), media: m, caption: "" }
                              : key === "layers"
                                ? { id: crypto.randomUUID(), media: m, depth: "SUBJECT" }
                                : m,
                          ]);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="lb-add-button"
                      onClick={() => change(key, [...item, newItem(key, ctx)])}
                    >
                      + Add {label.toLowerCase()}
                    </button>
                  ))}
              </fieldset>
            );
          }
          if (item && typeof item === "object") {
            const object = item as Record<string, unknown>;
            if ("url" in object && "alt" in object)
              return (
                <MediaField
                  key={key}
                  label={label}
                  media={object as MediaAsset}
                  onChange={(m) => change(key, m)}
                />
              );
            return (
              <fieldset key={key} className="lb-inspector-group">
                <legend>{label}</legend>
                <StructuredFields
                  value={object}
                  ctx={ctx}
                  path={`${path}.${key}`}
                  onChange={(next) => change(key, next)}
                />
              </fieldset>
            );
          }
          return null;
        })}
    </>
  );
}
export function BlockInspector({
  block,
  draft,
  catalog,
  onChange,
}: {
  block: LandingPageComponent;
  draft: LandingPageVariant;
  catalog: LandingCatalogItem[];
  onChange: (block: LandingPageComponent) => void;
}) {
  const [tab, setTab] = useState<"Content" | "Style" | "Motion">("Content");
  const ctx = {
    sections: draft.sections,
    catalog,
    blockType: block.type,
    layout: block.appearance?.layout,
    v2: draft.schemaVersion === 2,
  };
  const changeContent = (content: Record<string, unknown>) =>
    onChange({ ...block, content } as LandingPageComponent);
  const content = { ...block.content } as Record<string, unknown>;
  if (draft.schemaVersion === 2 && block.type === "HERO") {
    content.stripMedia ??= [];
    content.layers ??= [];
    content.missionText ??= "";
  }
  if (draft.schemaVersion === 2 && block.type === "GALLERY") content.media ??= [];
  return (
    <div>
      <div className="lb-inspector-title">
        <span>{blockRegistry[block.type].group}</span>
        <h2>{blockRegistry[block.type].label}</h2>
      </div>
      <div className="lb-tabs" role="tablist">
        {(["Content", "Style", "Motion"] as const).map((t) => (
          <button
            type="button"
            role="tab"
            key={t}
            aria-selected={t === tab}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Content" && (
        <>
          <StructuredFields value={content} ctx={ctx} onChange={changeContent} />
        </>
      )}
      {tab === "Style" && (
        <>
          <InspectorSelect
            label="Width"
            value={block.width}
            values={["FULL", "TWO_THIRDS", "HALF", "THIRD"]}
            onChange={(v) => onChange({ ...block, width: v as LandingPageComponent["width"] })}
          />
          {draft.schemaVersion === 2 && (
            <>
              <InspectorSelect
                label="Layout"
                value={block.appearance?.layout ?? blockRegistry[block.type].layouts[0]}
                values={blockRegistry[block.type].layouts}
                onChange={(layout) =>
                  onChange({
                    ...block,
                    ...(block.type === "TESTIMONIALS"
                      ? { content: { ...block.content, displayMode: layout as "RAIL" | "GRID" } }
                      : {}),
                    appearance: {
                      ...block.appearance,
                      layout: layout as NonNullable<LandingPageComponent["appearance"]>["layout"],
                    },
                  } as LandingPageComponent)
                }
              />
              <InspectorSelect
                label="Content alignment"
                value={block.appearance?.alignment ?? "LEFT"}
                values={options.alignment!}
                onChange={(v) =>
                  onChange({
                    ...block,
                    appearance: {
                      ...block.appearance,
                      alignment: v as "LEFT" | "CENTER" | "RIGHT",
                    },
                  })
                }
              />
              <InspectorSelect
                label="Mobile padding"
                value={block.appearance?.mobile?.padding ?? "NONE"}
                values={["NONE", "SMALL", "MEDIUM", "LARGE"]}
                onChange={(v) =>
                  onChange({
                    ...block,
                    appearance: {
                      ...block.appearance,
                      mobile: {
                        ...block.appearance?.mobile,
                        padding: v as "NONE" | "SMALL" | "MEDIUM" | "LARGE",
                      },
                    },
                  })
                }
              />
              {(block.type === "CATALOG" || block.type === "MENU" || block.type === "GALLERY") && (
                <InspectorSelect
                  label="Mobile columns"
                  value={block.appearance?.mobile?.columns ?? 1}
                  values={[1, 2]}
                  onChange={(v) =>
                    onChange({
                      ...block,
                      appearance: {
                        ...block.appearance,
                        mobile: { ...block.appearance?.mobile, columns: Number(v) as 1 | 2 },
                      },
                    })
                  }
                />
              )}
              {(block.type === "CATALOG" || block.type === "MENU") && (
                <>
                  <InspectorSelect
                    label="Card layout"
                    value={block.appearance?.cardLayout ?? "STANDARD"}
                    values={options.cardLayout!}
                    onChange={(v) =>
                      onChange({
                        ...block,
                        appearance: {
                          ...block.appearance,
                          cardLayout: v as "STANDARD" | "COMPACT" | "BOUTIQUE",
                        },
                      })
                    }
                  />
                  <InspectorSelect
                    label="Ordering layout"
                    value={block.appearance?.orderPresentation ?? "DEFAULT"}
                    values={options.orderPresentation!}
                    onChange={(v) =>
                      onChange({
                        ...block,
                        appearance: {
                          ...block.appearance,
                          orderPresentation: v as "DEFAULT" | "INLINE_SUMMARY",
                        },
                      })
                    }
                  />
                  {(["showQuickView", "showShopNow", "showAddToCart"] as const).map((key) => (
                    <label key={key} className="lb-checkbox">
                      <input
                        type="checkbox"
                        checked={block.appearance?.[key] ?? key !== "showShopNow"}
                        onChange={(e) =>
                          onChange({
                            ...block,
                            appearance: { ...block.appearance, [key]: e.target.checked },
                          })
                        }
                      />
                      {fieldName(key)}
                    </label>
                  ))}
                  {(["quickLabel", "shopLabel", "addLabel"] as const).map((key) => (
                    <InspectorField key={key} label={fieldName(key)}>
                      <input
                        value={block.appearance?.[key] ?? ""}
                        maxLength={40}
                        onChange={(e) =>
                          onChange({
                            ...block,
                            appearance: { ...block.appearance, [key]: e.target.value || undefined },
                          })
                        }
                      />
                    </InspectorField>
                  ))}
                </>
              )}
              {block.type === "SHOWCASE" && (
                <label className="lb-checkbox">
                  <input
                    type="checkbox"
                    checked={block.appearance?.showNumbers ?? false}
                    onChange={(e) =>
                      onChange({
                        ...block,
                        appearance: { ...block.appearance, showNumbers: e.target.checked },
                      })
                    }
                  />
                  Show numbers
                </label>
              )}
              {block.type === "HERO" && block.appearance?.layout === "PHOTO_STRIP" && (
                <InspectorSelect
                  label="Promotion panel"
                  value={block.appearance?.panelPlacement ?? "OVERLAP"}
                  values={options.panelPlacement!}
                  onChange={(v) =>
                    onChange({
                      ...block,
                      appearance: { ...block.appearance, panelPlacement: v as "OVERLAP" | "BELOW" },
                    })
                  }
                />
              )}
            </>
          )}
          <ColorField
            label="Button text color"
            value={block.buttonTextColor ?? ""}
            onChange={(v) => onChange({ ...block, buttonTextColor: v })}
          />
        </>
      )}
      {tab === "Motion" && (
        <>
          <p className="lb-help">Motion is paused while editing. Use Preview to play it.</p>
          {draft.schemaVersion === 2 && blockRegistry[block.type].motion && (
            <>
              <InspectorSelect
                label="Motion preset"
                value={block.motion?.preset ?? "NONE"}
                values={[
                  "NONE",
                  "REVEAL",
                  "IMAGE_REVEAL",
                  ...(block.type === "HERO" ? ["PARALLAX"] : []),
                  ...(block.type === "MEDIA_STORY" ? ["STICKY_STORY"] : []),
                ]}
                onChange={(v) =>
                  onChange({
                    ...block,
                    motion: {
                      preset: v as NonNullable<LandingPageComponent["motion"]>["preset"],
                      intensity: block.motion?.intensity ?? "SUBTLE",
                      durationMs: block.motion?.durationMs ?? 450,
                      mobile: block.motion?.mobile ?? "STATIC",
                    },
                  })
                }
              />
              {block.motion && (
                <StructuredFields
                  value={block.motion}
                  path="motion"
                  ctx={ctx}
                  onChange={(motion) =>
                    onChange({ ...block, motion: motion as LandingPageComponent["motion"] })
                  }
                />
              )}
              <button
                type="button"
                className="lb-text-button"
                onClick={() => onChange({ ...block, motion: undefined })}
              >
                Reset motion
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
