import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { api } from "@/api/client";
import {
  componentChoices,
  FloatingComponentToolbar,
} from "@/components/landing-page/ComponentPalette";
import {
  LandingPageComponentView,
  sectionScrollStyle,
} from "@/components/landing-page/LandingPageRenderer";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSkeleton } from "@/components/ui/skeleton";
import { getPublicSiteUrl } from "@/lib/public-site";
import type {
  LandingPageBuilderData,
  LandingPageComponent,
  LandingPageComponentType,
  LandingPageDisplayMode,
  LandingPageSection,
  LandingPageVariant,
  LandingPageVariantPayload,
} from "@/types/landing-page";
import {
  createLandingComponent,
  createLandingSection,
  normalizeLandingPageVariant,
} from "@/types/landing-page";
import { Header } from "./PigsPage";

type LandingPageBuilderPayload = Omit<LandingPageBuilderData, "variants"> & {
  variants: LandingPageVariantPayload[];
};

function SortableComponent({
  component,
  variant,
  menuItems,
  catalogItems,
  selected,
  onSelect,
  onToggle,
  onDuplicate,
  onRemove,
  device,
}: {
  component: LandingPageComponent;
  variant: LandingPageVariant;
  menuItems: LandingPageBuilderData["menuItems"];
  catalogItems: LandingPageBuilderData["catalogItems"];
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  device: "DESKTOP" | "TABLET" | "MOBILE";
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: component.id,
  });
  return (
    <div
      ref={setNodeRef}
      id={`builder-component-${component.id}`}
      className={`scroll-mt-24 scroll-mb-80 group relative min-w-0 border-2 transition-colors ${selected ? "border-pink-600" : "border-transparent hover:border-pink-300"} ${component.enabled ? "" : "opacity-45"} ${device === "MOBILE" || component.width === "FULL" ? "col-span-12" : component.width === "TWO_THIRDS" ? "col-span-8" : component.width === "HALF" ? "col-span-6" : "col-span-4"}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
    >
      <button
        type="button"
        aria-label={`Edit ${component.type.toLowerCase()} component`}
        className={
          component.type === "MENU" || component.type === "CATALOG"
            ? "absolute left-2 top-2 z-20 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-pink-700 shadow"
            : "absolute inset-0 z-10 cursor-pointer"
        }
        onClick={onSelect}
      >
        {(component.type === "MENU" || component.type === "CATALOG") && "Edit items"}
      </button>
      <div className="absolute right-2 top-2 z-20 hidden items-center gap-1 rounded-xl border border-stone-200 bg-white p-1 shadow-lg group-hover:flex group-focus-within:flex">
        <button
          type="button"
          aria-label={`Move ${component.type}`}
          className="cursor-grab rounded-lg p-2 hover:bg-pink-50"
          {...attributes}
          {...listeners}
        >
          <Icon icon="solar:hamburger-menu-linear" />
        </button>
        <button
          type="button"
          aria-label={component.enabled ? "Hide component" : "Show component"}
          className="rounded-lg p-2 hover:bg-pink-50"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <Icon icon={component.enabled ? "solar:eye-linear" : "solar:eye-closed-linear"} />
        </button>
        <button
          type="button"
          aria-label="Duplicate component"
          className="rounded-lg p-2 hover:bg-pink-50"
          onClick={(event) => {
            event.stopPropagation();
            onDuplicate();
          }}
        >
          <Icon icon="solar:copy-linear" />
        </button>
        <button
          type="button"
          aria-label="Remove component"
          className="rounded-lg p-2 text-red-600 hover:bg-red-50"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <Icon icon="solar:trash-bin-trash-linear" />
        </button>
      </div>
      <LandingPageComponentView
        component={component}
        menuItems={menuItems}
        catalogItems={catalogItems}
        theme={variant.theme}
        previewDevice={device}
        inSection
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const textAreaClass =
  "min-h-24 w-full resize-y rounded-xl border border-pink-100 bg-white px-3 py-2 text-sm outline-none focus:border-pink-600 focus:ring-3 focus:ring-pink-600/10";

function ComponentSettings({
  component,
  menuItems,
  catalogItems,
  onChange,
}: {
  component?: LandingPageComponent;
  menuItems: LandingPageBuilderData["menuItems"];
  catalogItems: LandingPageBuilderData["catalogItems"];
  onChange: (component: LandingPageComponent) => void;
}) {
  if (!component)
    return (
      <div className="rounded-2xl border border-dashed border-pink-200 p-5 text-center text-sm text-stone-500">
        Select a component in the preview to edit its content and layout.
      </div>
    );
  const replaceContent = (content: LandingPageComponent["content"]) =>
    onChange({ ...component, content } as LandingPageComponent);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-pink-700">
            Selected component
          </p>
          <h3 className="font-display text-xl font-semibold">
            {component.type.replaceAll("_", " ")}
          </h3>
        </div>
        <Icon
          icon={
            componentChoices.find((item) => item.type === component.type)?.icon ??
            "solar:widget-linear"
          }
          className="size-7 text-pink-300"
        />
      </div>
      <Field label="Width">
        <Select
          value={component.width}
          onValueChange={(value) =>
            onChange({ ...component, width: value as LandingPageComponent["width"] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["FULL", "TWO_THIRDS", "HALF", "THIRD"].map((value) => (
              <SelectItem key={value} value={value}>
                {value.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {component.type === "HERO" && (
        <>
          <Field label="Eyebrow">
            <Input
              value={component.content.eyebrow}
              onChange={(e) => replaceContent({ ...component.content, eyebrow: e.target.value })}
            />
          </Field>
          <Field label="Headline">
            <Input
              value={component.content.title}
              onChange={(e) => replaceContent({ ...component.content, title: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={textAreaClass}
              value={component.content.body}
              onChange={(e) => replaceContent({ ...component.content, body: e.target.value })}
            />
          </Field>
          <Field label="Public media URL">
            <Input
              type="url"
              value={component.content.mediaUrl}
              onChange={(e) => replaceContent({ ...component.content, mediaUrl: e.target.value })}
              placeholder="https://..."
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Primary button">
              <Input
                value={component.content.primaryLabel}
                onChange={(e) =>
                  replaceContent({ ...component.content, primaryLabel: e.target.value })
                }
              />
            </Field>
            <Field label="Primary link">
              <Input
                value={component.content.primaryUrl}
                onChange={(e) =>
                  replaceContent({ ...component.content, primaryUrl: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Secondary button">
              <Input
                value={component.content.secondaryLabel}
                onChange={(e) =>
                  replaceContent({ ...component.content, secondaryLabel: e.target.value })
                }
              />
            </Field>
            <Field label="Secondary link">
              <Input
                value={component.content.secondaryUrl}
                onChange={(e) =>
                  replaceContent({ ...component.content, secondaryUrl: e.target.value })
                }
              />
            </Field>
          </div>
        </>
      )}
      {component.type === "TEXT" && (
        <>
          <Field label="Heading">
            <Input
              value={component.content.heading}
              onChange={(e) => replaceContent({ ...component.content, heading: e.target.value })}
            />
          </Field>
          <Field label="Body">
            <textarea
              className={textAreaClass}
              value={component.content.body}
              onChange={(e) => replaceContent({ ...component.content, body: e.target.value })}
            />
          </Field>
          <Field label="Alignment">
            <Select
              value={component.content.alignment}
              onValueChange={(value) =>
                replaceContent({ ...component.content, alignment: value as "LEFT" | "CENTER" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LEFT">Left</SelectItem>
                <SelectItem value="CENTER">Center</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      )}
      {(component.type === "MENU" || component.type === "CATALOG") && (
        <Field label="Item display">
          <Select
            value={component.content.displayMode ?? "VERTICAL"}
            onValueChange={(value) =>
              replaceContent({ ...component.content, displayMode: value as LandingPageDisplayMode })
            }
          >
            <SelectTrigger aria-label="Item display">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VERTICAL">Vertical scrolling grid</SelectItem>
              <SelectItem value="HORIZONTAL">Horizontal carousel</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-stone-500">
            Set a maximum height in Section settings to keep long lists inside the section.
          </p>
        </Field>
      )}
      {component.type === "MENU" && (
        <>
          <Field label="Heading">
            <Input
              value={component.content.heading}
              onChange={(e) => replaceContent({ ...component.content, heading: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={textAreaClass}
              value={component.content.body}
              onChange={(e) => replaceContent({ ...component.content, body: e.target.value })}
            />
          </Field>
          <Field label="Columns">
            <Select
              value={String(component.content.columns)}
              onValueChange={(value) =>
                replaceContent({ ...component.content, columns: Number(value) as 2 | 3 | 4 })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div>
            <Label>Featured menu items</Label>
            <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-pink-100 p-2">
              {menuItems.length ? (
                menuItems.map((item) => {
                  const checked = component.content.menuItemIds.includes(item._id);
                  return (
                    <label
                      key={item._id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-pink-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          replaceContent({
                            ...component.content,
                            menuItemIds: checked
                              ? component.content.menuItemIds.filter((id) => id !== item._id)
                              : [...component.content.menuItemIds, item._id],
                          })
                        }
                      />
                      <span>{item.name}</span>
                    </label>
                  );
                })
              ) : (
                <p className="p-2 text-sm text-stone-500">
                  Add menu items from the Menu page first.
                </p>
              )}
            </div>
          </div>
        </>
      )}
      {component.type === "CATALOG" && (
        <>
          <Field label="Heading">
            <Input
              value={component.content.heading}
              onChange={(event) =>
                replaceContent({ ...component.content, heading: event.target.value })
              }
            />
          </Field>
          <Field label="Description">
            <textarea
              className={textAreaClass}
              value={component.content.body}
              onChange={(event) =>
                replaceContent({ ...component.content, body: event.target.value })
              }
            />
          </Field>
          <Field label="Columns">
            <Select
              value={String(component.content.columns)}
              onValueChange={(value) =>
                replaceContent({ ...component.content, columns: Number(value) as 2 | 3 | 4 })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div>
            <Label>Featured catalog items</Label>
            <div className="mt-2 max-h-60 space-y-2 overflow-y-auto rounded-xl border border-pink-100 p-2">
              {catalogItems.length ? (
                catalogItems.map((item) => {
                  const checked = component.content.catalogItemRefs.some(
                    (reference) =>
                      reference.sourceType === item.sourceType &&
                      reference.sourceId === item.sourceId,
                  );
                  return (
                    <label
                      key={item.key}
                      className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-pink-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          replaceContent({
                            ...component.content,
                            catalogItemRefs: checked
                              ? component.content.catalogItemRefs.filter(
                                  (reference) =>
                                    !(
                                      reference.sourceType === item.sourceType &&
                                      reference.sourceId === item.sourceId
                                    ),
                                )
                              : [
                                  ...component.content.catalogItemRefs,
                                  { sourceType: item.sourceType, sourceId: item.sourceId },
                                ],
                          })
                        }
                      />
                      <span className="flex-1">{item.name}</span>
                      <span className="text-[10px] font-bold uppercase text-stone-400">
                        {item.productType.replaceAll("_", " ")}
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className="p-2 text-sm text-stone-500">
                  Add menu items or general products first.
                </p>
              )}
            </div>
          </div>
        </>
      )}
      {component.type === "GALLERY" && (
        <>
          <Field label="Heading">
            <Input
              value={component.content.heading}
              onChange={(e) => replaceContent({ ...component.content, heading: e.target.value })}
            />
          </Field>
          <Field label="Media URLs (one per line)">
            <textarea
              className={textAreaClass}
              value={component.content.mediaUrls.join("\n")}
              onChange={(e) =>
                replaceContent({
                  ...component.content,
                  mediaUrls: e.target.value
                    .split("\n")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
              placeholder="https://..."
            />
          </Field>
          <Field label="Columns">
            <Select
              value={String(component.content.columns)}
              onValueChange={(value) =>
                replaceContent({ ...component.content, columns: Number(value) as 2 | 3 | 4 })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </>
      )}
      {component.type === "CONTACT" && (
        <>
          <Field label="Heading">
            <Input
              value={component.content.heading}
              onChange={(e) => replaceContent({ ...component.content, heading: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={textAreaClass}
              value={component.content.body}
              onChange={(e) => replaceContent({ ...component.content, body: e.target.value })}
            />
          </Field>
          <Field label="Address">
            <Input
              value={component.content.address}
              onChange={(e) => replaceContent({ ...component.content, address: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <Input
                value={component.content.phone}
                onChange={(e) => replaceContent({ ...component.content, phone: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                value={component.content.email}
                onChange={(e) => replaceContent({ ...component.content, email: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Business hours">
            <textarea
              className={textAreaClass}
              value={component.content.hours}
              onChange={(e) => replaceContent({ ...component.content, hours: e.target.value })}
            />
          </Field>
          <Field label="Facebook URL">
            <Input
              type="url"
              value={component.content.facebookUrl}
              onChange={(e) =>
                replaceContent({ ...component.content, facebookUrl: e.target.value })
              }
            />
          </Field>
          <Field label="Instagram URL">
            <Input
              type="url"
              value={component.content.instagramUrl}
              onChange={(e) =>
                replaceContent({ ...component.content, instagramUrl: e.target.value })
              }
            />
          </Field>
          <Field label="Map URL">
            <Input
              type="url"
              value={component.content.mapUrl}
              onChange={(e) => replaceContent({ ...component.content, mapUrl: e.target.value })}
            />
          </Field>
        </>
      )}
      {component.type === "CTA" && (
        <>
          <Field label="Heading">
            <Input
              value={component.content.heading}
              onChange={(e) => replaceContent({ ...component.content, heading: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={textAreaClass}
              value={component.content.body}
              onChange={(e) => replaceContent({ ...component.content, body: e.target.value })}
            />
          </Field>
          <Field label="Button label">
            <Input
              value={component.content.buttonLabel}
              onChange={(e) =>
                replaceContent({ ...component.content, buttonLabel: e.target.value })
              }
            />
          </Field>
          <Field label="Button link">
            <Input
              value={component.content.buttonUrl}
              onChange={(e) => replaceContent({ ...component.content, buttonUrl: e.target.value })}
            />
          </Field>
        </>
      )}
    </div>
  );
}

function sectionWidthClass(section: LandingPageSection) {
  if (section.contentWidth === "FULL") return "max-w-none";
  if (section.contentWidth === "CONTAINED") return "mx-auto max-w-5xl";
  return "mx-auto max-w-7xl";
}

function sectionPaddingClass(section: LandingPageSection) {
  if (section.padding === "NONE") return "";
  if (section.padding === "SMALL") return "px-4 py-5 sm:px-6";
  if (section.padding === "LARGE") return "px-6 py-16 sm:px-10";
  return "px-5 py-10 sm:px-8";
}

function sectionGapClass(section: LandingPageSection) {
  if (section.gap === "NONE") return "gap-0";
  if (section.gap === "SMALL") return "gap-3";
  if (section.gap === "LARGE") return "gap-10";
  return "gap-6";
}

function SectionSettings({
  section,
  theme,
  onChange,
}: {
  section?: LandingPageSection;
  theme: LandingPageVariant["theme"];
  onChange: (section: LandingPageSection) => void;
}) {
  if (!section)
    return (
      <div className="rounded-2xl border border-dashed border-pink-200 p-5 text-center text-sm text-stone-500">
        Select a section or component in the preview to edit its layout.
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-pink-700">
            Selected section
          </p>
          <h3 className="font-display text-xl font-semibold">{section.name}</h3>
        </div>
        <Icon icon="solar:layers-minimalistic-linear" className="size-7 text-pink-300" />
      </div>
      <Field label="Section name">
        <Input
          value={section.name}
          onChange={(event) => onChange({ ...section, name: event.target.value })}
        />
      </Field>
      <Field label="Maximum section height (px)">
        <Input
          type="number"
          aria-label="Maximum section height (px)"
          min={0}
          max={3000}
          step={1}
          placeholder="Unlimited"
          value={section.maxHeight || ""}
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            onChange({
              ...section,
              maxHeight: Number.isFinite(value)
                ? Math.min(3000, Math.max(0, Math.round(value)))
                : 0,
            });
          }}
        />
        <p className="mt-2 text-xs text-stone-500">
          Leave blank or enter 0 for unlimited height. Taller content scrolls inside the section.
          Maximum: 3,000 px.
        </p>
      </Field>
      <Field label="Content width">
        <Select
          value={section.contentWidth}
          onValueChange={(value) =>
            onChange({
              ...section,
              contentWidth: value as LandingPageSection["contentWidth"],
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FULL">Full</SelectItem>
            <SelectItem value="WIDE">Wide</SelectItem>
            <SelectItem value="CONTAINED">Contained</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Padding">
          <Select
            value={section.padding}
            onValueChange={(value) =>
              onChange({ ...section, padding: value as LandingPageSection["padding"] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["NONE", "SMALL", "MEDIUM", "LARGE"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Component gap">
          <Select
            value={section.gap}
            onValueChange={(value) =>
              onChange({ ...section, gap: value as LandingPageSection["gap"] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["NONE", "SMALL", "MEDIUM", "LARGE"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Background">
          <input
            type="color"
            className="h-10 w-full rounded-lg"
            value={section.backgroundColor || theme.backgroundColor}
            onChange={(event) => onChange({ ...section, backgroundColor: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full"
            disabled={!section.backgroundColor}
            onClick={() => onChange({ ...section, backgroundColor: "" })}
          >
            Use page color
          </Button>
        </Field>
        <Field label="Text">
          <input
            type="color"
            className="h-10 w-full rounded-lg"
            value={section.textColor || theme.textColor}
            onChange={(event) => onChange({ ...section, textColor: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full"
            disabled={!section.textColor}
            onClick={() => onChange({ ...section, textColor: "" })}
          >
            Use page color
          </Button>
        </Field>
      </div>
    </div>
  );
}

function SortableSection({
  section,
  variant,
  menuItems,
  catalogItems,
  selectedSectionId,
  selectedComponentId,
  device,
  onSelectSection,
  onSelectComponent,
  onUpdateComponent,
  onDuplicateComponent,
  onRemoveComponent,
  onToggle,
  onDuplicate,
  onRemove,
}: {
  section: LandingPageSection;
  variant: LandingPageVariant;
  menuItems: LandingPageBuilderData["menuItems"];
  catalogItems: LandingPageBuilderData["catalogItems"];
  selectedSectionId?: string;
  selectedComponentId?: string;
  device: "DESKTOP" | "TABLET" | "MOBILE";
  onSelectSection: () => void;
  onSelectComponent: (componentId: string) => void;
  onUpdateComponent: (component: LandingPageComponent) => void;
  onDuplicateComponent: (component: LandingPageComponent) => void;
  onRemoveComponent: (component: LandingPageComponent) => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `section:${section.id}`,
  });
  const { setNodeRef: setAreaRef, isOver } = useDroppable({ id: `section-area:${section.id}` });
  return (
    <div
      ref={setNodeRef}
      id={`builder-section-${section.id}`}
      className={`scroll-mt-24 relative border-2 transition-colors ${selectedSectionId === section.id ? "border-pink-500" : "border-transparent hover:border-pink-200"} ${section.enabled ? "" : "opacity-45"}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
    >
      <div className="flex items-center gap-2 border-b border-pink-100 bg-pink-50/95 px-3 py-2 text-xs text-stone-600">
        <button
          type="button"
          className="cursor-grab rounded-lg p-1.5 hover:bg-white"
          aria-label={`Move ${section.name} section`}
          {...attributes}
          {...listeners}
        >
          <Icon icon="solar:hamburger-menu-linear" />
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left font-bold"
          onClick={onSelectSection}
        >
          {section.name}
        </button>
        <span>{section.components.length} components</span>
        <button
          type="button"
          className="rounded-lg p-1.5 hover:bg-white"
          aria-label={section.enabled ? "Hide section" : "Show section"}
          onClick={onToggle}
        >
          <Icon icon={section.enabled ? "solar:eye-linear" : "solar:eye-closed-linear"} />
        </button>
        <button
          type="button"
          className="rounded-lg p-1.5 hover:bg-white"
          aria-label="Duplicate section"
          onClick={onDuplicate}
        >
          <Icon icon="solar:copy-linear" />
        </button>
        <button
          type="button"
          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
          aria-label="Remove section"
          onClick={onRemove}
        >
          <Icon icon="solar:trash-bin-trash-linear" />
        </button>
      </div>
      <div
        ref={setAreaRef}
        className={`${isOver ? "ring-4 ring-inset ring-pink-300/60" : ""}`}
        style={{
          ...sectionScrollStyle(section),
          background: section.backgroundColor || variant.theme.backgroundColor,
          color: section.textColor || variant.theme.textColor,
        }}
      >
        <div className={`${sectionWidthClass(section)} ${sectionPaddingClass(section)}`}>
          <SortableContext
            items={section.components.map((component) => component.id)}
            strategy={rectSortingStrategy}
          >
            <div className={`grid min-h-20 grid-cols-12 ${sectionGapClass(section)}`}>
              {section.components.map((component) => (
                <SortableComponent
                  key={component.id}
                  component={component}
                  variant={variant}
                  menuItems={menuItems}
                  catalogItems={catalogItems}
                  selected={selectedComponentId === component.id}
                  onSelect={() => onSelectComponent(component.id)}
                  onToggle={() => onUpdateComponent({ ...component, enabled: !component.enabled })}
                  onDuplicate={() => onDuplicateComponent(component)}
                  onRemove={() => onRemoveComponent(component)}
                  device={device}
                />
              ))}
              {!section.components.length && (
                <button
                  type="button"
                  className="col-span-12 grid min-h-28 place-items-center rounded-xl border-2 border-dashed border-pink-200 bg-white/60 p-4 text-sm font-semibold text-stone-400"
                  onClick={onSelectSection}
                >
                  Drop or add components to {section.name}
                </button>
              )}
            </div>
          </SortableContext>
        </div>
      </div>
    </div>
  );
}

export function LandingPageBuilderPage() {
  const queryClient = useQueryClient();
  const [variantId, setVariantId] = useState("");
  const [draft, setDraft] = useState<LandingPageVariant>();
  const [selectedSectionId, setSelectedSectionId] = useState<string>();
  const [selectedComponentId, setSelectedComponentId] = useState<string>();
  const [device, setDevice] = useState<"DESKTOP" | "TABLET" | "MOBILE">("DESKTOP");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commerceSettingsOpen, setCommerceSettingsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activePaletteType, setActivePaletteType] = useState<LandingPageComponentType>();
  const [addedComponentId, setAddedComponentId] = useState<string>();
  const undoStack = useRef<LandingPageVariant[]>([]);
  const redoStack = useRef<LandingPageVariant[]>([]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const builder = useQuery({
    queryKey: ["landing-page-builder"],
    queryFn: async () => {
      const data = await api<LandingPageBuilderPayload>("/landing-page");
      return { ...data, variants: data.variants.map(normalizeLandingPageVariant) };
    },
  });
  useEffect(() => {
    if (!builder.data?.variants.length || draft) return;
    const first = builder.data.variants[0];
    if (!first) return;
    setVariantId(first._id);
    setDraft(structuredClone(first));
    setSelectedSectionId(first.sections[0]?.id);
  }, [builder.data, draft]);

  useEffect(() => {
    if (!addedComponentId) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`builder-component-${addedComponentId}`)?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [addedComponentId]);

  function commit(next: LandingPageVariant) {
    if (draft) undoStack.current = [...undoStack.current, structuredClone(draft)].slice(-100);
    redoStack.current = [];
    setDraft(next);
    setDirty(true);
  }
  function undo() {
    const previous = undoStack.current.pop();
    if (!previous || !draft) return;
    redoStack.current.push(structuredClone(draft));
    setDraft(previous);
    setDirty(true);
  }
  function redo() {
    const next = redoStack.current.pop();
    if (!next || !draft) return;
    undoStack.current.push(structuredClone(draft));
    setDraft(next);
    setDirty(true);
  }
  function chooseVariant(id: string) {
    if (dirty && !window.confirm("Discard unsaved changes and switch variants?")) return;
    const next = builder.data?.variants.find((variant) => variant._id === id);
    if (!next) return;
    setVariantId(id);
    setDraft(structuredClone(next));
    setSelectedSectionId(next.sections[0]?.id);
    setSelectedComponentId(undefined);
    setDirty(false);
    undoStack.current = [];
    redoStack.current = [];
  }
  function updateComponent(component: LandingPageComponent) {
    if (!draft) return;
    commit({
      ...draft,
      sections: draft.sections.map((section) => ({
        ...section,
        components: section.components.map((item) => (item.id === component.id ? component : item)),
      })),
    });
  }
  function updateSection(section: LandingPageSection) {
    if (!draft) return;
    commit({
      ...draft,
      sections: draft.sections.map((item) => (item.id === section.id ? section : item)),
    });
  }
  function componentCount(variant = draft) {
    return variant?.sections.reduce((count, section) => count + section.components.length, 0) ?? 0;
  }
  function resolveSectionId(dropId: string) {
    if (!draft) return undefined;
    if (dropId.startsWith("section-area:")) return dropId.replace("section-area:", "");
    if (dropId.startsWith("section:")) return dropId.replace("section:", "");
    return draft.sections.find((section) =>
      section.components.some((component) => component.id === dropId),
    )?.id;
  }
  function addComponent(type: LandingPageComponentType, requestedSectionId?: string) {
    if (!draft) return;
    if (componentCount() >= 30) return toast.error("Use no more than 30 components");
    const sectionId = requestedSectionId ?? selectedSectionId ?? draft.sections[0]?.id;
    if (!sectionId) return;
    const component = createLandingComponent(type);
    commit({
      ...draft,
      sections: draft.sections.map((section) =>
        section.id === sectionId
          ? { ...section, components: [...section.components, component] }
          : section,
      ),
    });
    setSelectedSectionId(sectionId);
    setSelectedComponentId(component.id);
    setAddedComponentId(component.id);
  }
  function onDragEnd(event: DragEndEvent) {
    setActivePaletteType(undefined);
    if (!draft || !event.over) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const targetSectionId = resolveSectionId(overId);
    if (activeId.startsWith("section:")) {
      const sectionId = activeId.replace("section:", "");
      if (!targetSectionId || sectionId === targetSectionId) return;
      const oldIndex = draft.sections.findIndex((section) => section.id === sectionId);
      const newIndex = draft.sections.findIndex((section) => section.id === targetSectionId);
      if (oldIndex >= 0 && newIndex >= 0)
        commit({ ...draft, sections: arrayMove(draft.sections, oldIndex, newIndex) });
      return;
    }
    if (activeId.startsWith("palette:")) {
      if (componentCount() >= 30) return toast.error("Use no more than 30 components");
      const type = event.active.data.current?.componentType as LandingPageComponentType | undefined;
      if (!type || !componentChoices.some((choice) => choice.type === type) || !targetSectionId)
        return;
      const component = createLandingComponent(type);
      const sectionId = targetSectionId;
      commit({
        ...draft,
        sections: draft.sections.map((section) => {
          if (section.id !== sectionId) return section;
          const index = section.components.findIndex((item) => item.id === overId);
          const components = [...section.components];
          components.splice(index >= 0 ? index : components.length, 0, component);
          return { ...section, components };
        }),
      });
      setSelectedSectionId(sectionId);
      setSelectedComponentId(component.id);
      setAddedComponentId(component.id);
      return;
    }
    if (activeId === overId) return;
    const sourceSection = draft.sections.find((section) =>
      section.components.some((component) => component.id === activeId),
    );
    if (!sourceSection || !targetSectionId) return;
    if (sourceSection.id === targetSectionId) {
      const oldIndex = sourceSection.components.findIndex((item) => item.id === activeId);
      const overIndex = sourceSection.components.findIndex((item) => item.id === overId);
      const newIndex = overIndex >= 0 ? overIndex : sourceSection.components.length - 1;
      if (oldIndex >= 0 && oldIndex !== newIndex)
        commit({
          ...draft,
          sections: draft.sections.map((section) =>
            section.id === sourceSection.id
              ? { ...section, components: arrayMove(section.components, oldIndex, newIndex) }
              : section,
          ),
        });
      return;
    }
    const moving = sourceSection.components.find((component) => component.id === activeId);
    if (!moving) return;
    commit({
      ...draft,
      sections: draft.sections.map((section) => {
        if (section.id === sourceSection.id)
          return {
            ...section,
            components: section.components.filter((component) => component.id !== activeId),
          };
        if (section.id !== targetSectionId) return section;
        const index = section.components.findIndex((component) => component.id === overId);
        const components = [...section.components];
        components.splice(index >= 0 ? index : components.length, 0, moving);
        return { ...section, components };
      }),
    });
    setSelectedSectionId(targetSectionId);
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["landing-page-builder"] });
  const initialize = useMutation({
    mutationFn: async () => {
      const data = await api<LandingPageBuilderPayload>("/landing-page", { method: "POST" });
      return { ...data, variants: data.variants.map(normalizeLandingPageVariant) };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["landing-page-builder"], data);
      toast.success("Landing-page builder created");
    },
    onError: (error) => toast.error(error.message),
  });
  const save = useMutation({
    mutationFn: async (variant: LandingPageVariant) => {
      const saved = await api<LandingPageVariantPayload>(`/landing-page/variants/${variant._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: variant.name,
          theme: variant.theme,
          commerce: variant.commerce,
          sections: variant.sections,
        }),
      });
      return normalizeLandingPageVariant(saved);
    },
    onSuccess: (saved) => {
      setDraft(structuredClone(saved));
      setDirty(false);
      undoStack.current = [];
      redoStack.current = [];
      void refresh();
      toast.success("Draft saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const publish = useMutation({
    mutationFn: async (variant: LandingPageVariant) => {
      if (dirty)
        await api(`/landing-page/variants/${variant._id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: variant.name,
            theme: variant.theme,
            commerce: variant.commerce,
            sections: variant.sections,
          }),
        });
      return api(`/landing-page/variants/${variant._id}/publish`, { method: "POST" });
    },
    onSuccess: () => {
      setDirty(false);
      void refresh();
      toast.success("Landing page published", {
        description: getPublicSiteUrl(builder.data?.page?.slug ?? ""),
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const unpublish = useMutation({
    mutationFn: () => api("/landing-page/unpublish", { method: "POST" }),
    onSuccess: () => {
      void refresh();
      toast.success("Landing page unpublished");
    },
    onError: (error) => toast.error(error.message),
  });
  const createVariant = useMutation({
    mutationFn: async ({ name, source }: { name: string; source?: string }) => {
      const created = await api<LandingPageVariantPayload>("/landing-page/variants", {
        method: "POST",
        body: JSON.stringify({ name, duplicateFromId: source }),
      });
      return normalizeLandingPageVariant(created);
    },
    onSuccess: (created) => {
      void refresh();
      setVariantId(created._id);
      setDraft(structuredClone(created));
      setSelectedSectionId(created.sections[0]?.id);
      setSelectedComponentId(undefined);
      setDirty(false);
      toast.success("Variant created");
    },
    onError: (error) => toast.error(error.message),
  });
  const removeVariant = useMutation({
    mutationFn: (id: string) => api<void>(`/landing-page/variants/${id}`, { method: "DELETE" }),
    onSuccess: (_data, deletedId) => {
      queryClient.setQueryData<LandingPageBuilderData>(["landing-page-builder"], (current) =>
        current
          ? {
              ...current,
              variants: current.variants.filter((variant) => variant._id !== deletedId),
            }
          : current,
      );
      setDraft(undefined);
      setVariantId("");
      setSelectedSectionId(undefined);
      setSelectedComponentId(undefined);
      setDirty(false);
      void refresh();
      toast.success("Variant deleted");
    },
    onError: (error) => toast.error(error.message),
  });
  const saveSettings = useMutation({
    mutationFn: (payload: unknown) =>
      api("/landing-page/settings", { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setSettingsOpen(false);
      void refresh();
      toast.success("Page settings saved");
    },
    onError: (error) => toast.error(error.message),
  });

  if (builder.isLoading) return <PageSkeleton cards={5} />;
  if (builder.isError)
    return <QueryError message={builder.error.message} retry={() => builder.refetch()} />;
  if (!builder.data?.page)
    return (
      <div className="space-y-6">
        <Header
          title="Landing page"
          description="Build and publish a public page for your business."
        />
        <Card className="grid min-h-96 place-items-center p-8 text-center">
          <div>
            <Icon icon="solar:palette-round-linear" className="mx-auto size-16 text-pink-300" />
            <h2 className="mt-4 font-display text-2xl font-semibold">
              Create your landing-page workspace
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
              Start with a ready-to-edit layout, then drag components into the live preview.
            </p>
            <Button
              className="mt-6"
              onClick={() => initialize.mutate()}
              disabled={initialize.isPending}
            >
              <Icon icon="solar:add-circle-linear" /> Start building
            </Button>
          </div>
        </Card>
      </div>
    );
  if (!draft) return <PageSkeleton />;
  const page = builder.data.page;
  const selectedSection = draft.sections.find((section) => section.id === selectedSectionId);
  const selected = draft.sections
    .flatMap((section) => section.components)
    .find((item) => item.id === selectedComponentId);
  const previewWidth =
    device === "MOBILE" ? "max-w-[390px]" : device === "TABLET" ? "max-w-[760px]" : "max-w-full";
  const hasOrderableItems = draft.sections.some(
    (section) =>
      section.enabled &&
      section.components.some(
        (component) =>
          component.enabled &&
          ((component.type === "MENU" && component.content.menuItemIds.length > 0) ||
            (component.type === "CATALOG" && component.content.catalogItemRefs.length > 0)),
      ),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        if (String(args.active.id).startsWith("palette:") && args.pointerCoordinates) {
          const toolbar = document
            .getElementById("floating-component-toolbar")
            ?.getBoundingClientRect();
          const { x, y } = args.pointerCoordinates;
          if (
            toolbar &&
            x >= toolbar.left &&
            x <= toolbar.right &&
            y >= toolbar.top &&
            y <= toolbar.bottom
          )
            return [];
        }
        return rectIntersection(args);
      }}
      onDragStart={({ active }) => setActivePaletteType(active.data.current?.componentType)}
      onDragCancel={() => setActivePaletteType(undefined)}
      onDragEnd={onDragEnd}
    >
      <div className="space-y-5">
        <Header
          title="Landing page builder"
          description="Drag components into the live preview, save variants, and publish when ready."
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Icon icon="solar:settings-linear" /> Page settings
            </Button>
            <Button variant="outline" onClick={() => setCommerceSettingsOpen(true)}>
              <Icon icon="solar:cart-large-2-linear" /> Cart & checkout
            </Button>
            <Button
              variant="outline"
              onClick={() => save.mutate(draft)}
              disabled={!dirty || save.isPending}
            >
              <Icon icon="solar:diskette-linear" /> Save draft
            </Button>
            <Button onClick={() => publish.mutate(draft)} disabled={publish.isPending}>
              <Icon icon="solar:upload-linear" /> Publish
            </Button>
          </div>
        </Header>

        <Card className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-48">
            <Label>Variant</Label>
            <Select value={variantId} onValueChange={chooseVariant}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {builder.data.variants.map((variant) => (
                  <SelectItem key={variant._id} value={variant._id}>
                    {variant.name}
                    {page.publishedVariantId === variant._id ? " · LIVE" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const name = window.prompt("New variant name");
              if (name?.trim()) createVariant.mutate({ name: name.trim() });
            }}
          >
            <Icon icon="solar:add-circle-linear" /> New from template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const name = window.prompt("Duplicated variant name", `${draft.name} copy`);
              if (name?.trim()) createVariant.mutate({ name: name.trim(), source: draft._id });
            }}
          >
            <Icon icon="solar:copy-linear" /> Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const name = window.prompt("Variant name", draft.name);
              if (name?.trim() && name.trim() !== draft.name)
                commit({ ...draft, name: name.trim() });
            }}
          >
            <Icon icon="solar:pen-linear" /> Rename
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={builder.data.variants.length <= 1}
            onClick={() => {
              if (window.confirm(`Delete ${draft.name}?`)) removeVariant.mutate(draft._id);
            }}
          >
            <Icon icon="solar:trash-bin-trash-linear" /> Delete
          </Button>
          <div className="ml-auto flex items-center gap-2 text-xs font-semibold">
            <span
              className={`size-2 rounded-full ${page.isPublished ? "bg-emerald-500" : "bg-stone-300"}`}
            />
            {page.isPublished ? "Published" : "Not published"}
            {page.isPublished && (
              <>
                <Button asChild variant="ghost" size="sm">
                  <a href={getPublicSiteUrl(page.slug)} target="_blank" rel="noreferrer">
                    View live
                  </a>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => unpublish.mutate()}>
                  Unpublish
                </Button>
              </>
            )}
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[210px_minmax(0,1fr)_320px]">
          <Card className="h-fit p-4 xl:sticky xl:top-20">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
                  Sections
                </p>
                <span className="text-xs text-stone-400">{draft.sections.length}/20</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                disabled={draft.sections.length >= 20}
                onClick={() => {
                  const section = createLandingSection(`Section ${draft.sections.length + 1}`);
                  commit({ ...draft, sections: [...draft.sections, section] });
                  setSelectedSectionId(section.id);
                  setSelectedComponentId(undefined);
                }}
              >
                <Icon icon="solar:add-square-linear" /> Add section
              </Button>
            </div>
            <div className="mt-5 border-t border-pink-100 pt-4">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Theme</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Primary">
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg"
                    value={draft.theme.primaryColor}
                    onChange={(e) =>
                      commit({ ...draft, theme: { ...draft.theme, primaryColor: e.target.value } })
                    }
                  />
                </Field>
                <Field label="Background">
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg"
                    value={draft.theme.backgroundColor}
                    onChange={(e) =>
                      commit({
                        ...draft,
                        theme: { ...draft.theme, backgroundColor: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Surface">
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg"
                    value={draft.theme.surfaceColor}
                    onChange={(e) =>
                      commit({ ...draft, theme: { ...draft.theme, surfaceColor: e.target.value } })
                    }
                  />
                </Field>
                <Field label="Text">
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg"
                    value={draft.theme.textColor}
                    onChange={(e) =>
                      commit({ ...draft, theme: { ...draft.theme, textColor: e.target.value } })
                    }
                  />
                </Field>
              </div>
              <div className="mt-3 space-y-3">
                <Field label="Font style">
                  <Select
                    value={draft.theme.fontStyle}
                    onValueChange={(value) =>
                      commit({
                        ...draft,
                        theme: {
                          ...draft.theme,
                          fontStyle: value as LandingPageVariant["theme"]["fontStyle"],
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLASSIC">Classic</SelectItem>
                      <SelectItem value="MODERN">Modern</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Button shape">
                  <Select
                    value={draft.theme.buttonStyle}
                    onValueChange={(value) =>
                      commit({
                        ...draft,
                        theme: {
                          ...draft.theme,
                          buttonStyle: value as LandingPageVariant["theme"]["buttonStyle"],
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["ROUNDED", "PILL", "SQUARE"].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          </Card>

          <Card className="min-w-0 overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pink-100 bg-white px-4 py-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-pink-700">
                  Live preview
                </p>
                <p className="text-xs text-stone-500">
                  {dirty ? "Unsaved changes" : "Draft saved"}
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-xl bg-pink-50 p-1">
                {(["DESKTOP", "TABLET", "MOBILE"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${value.toLowerCase()} preview`}
                    className={`rounded-lg p-2 ${device === value ? "bg-white text-pink-700 shadow-sm" : "text-stone-400"}`}
                    onClick={() => setDevice(value)}
                  >
                    <Icon
                      icon={
                        value === "DESKTOP"
                          ? "solar:monitor-linear"
                          : value === "TABLET"
                            ? "solar:tablet-linear"
                            : "solar:smartphone-linear"
                      }
                    />
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-pink-200" />
                <button
                  type="button"
                  className="rounded-lg p-2 disabled:opacity-30"
                  aria-label="Undo"
                  disabled={!undoStack.current.length}
                  onClick={undo}
                >
                  <Icon icon="solar:undo-left-linear" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 disabled:opacity-30"
                  aria-label="Redo"
                  disabled={!redoStack.current.length}
                  onClick={redo}
                >
                  <Icon icon="solar:undo-right-linear" />
                </button>
              </div>
            </div>
            <div className="overflow-auto bg-stone-100 p-3 sm:p-5">
              <div
                className={`relative mx-auto min-h-[640px] overflow-hidden bg-white shadow-xl transition-[max-width] ${previewWidth}`}
                style={{ background: draft.theme.backgroundColor, color: draft.theme.textColor }}
              >
                <SortableContext
                  items={draft.sections.map((section) => `section:${section.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {draft.sections.map((section) => (
                    <SortableSection
                      key={section.id}
                      section={section}
                      variant={draft}
                      menuItems={builder.data.menuItems}
                      catalogItems={builder.data.catalogItems ?? []}
                      selectedSectionId={selectedSectionId}
                      selectedComponentId={selectedComponentId}
                      onSelectSection={() => {
                        setSelectedSectionId(section.id);
                        setSelectedComponentId(undefined);
                      }}
                      onSelectComponent={(componentId) => {
                        setSelectedSectionId(section.id);
                        setSelectedComponentId(componentId);
                      }}
                      onUpdateComponent={updateComponent}
                      onDuplicateComponent={(component) => {
                        if (componentCount() >= 30)
                          return toast.error("Use no more than 30 components");
                        const copy = { ...structuredClone(component), id: crypto.randomUUID() };
                        const index = section.components.findIndex(
                          (item) => item.id === component.id,
                        );
                        commit({
                          ...draft,
                          sections: draft.sections.map((item) =>
                            item.id === section.id
                              ? {
                                  ...item,
                                  components: [
                                    ...item.components.slice(0, index + 1),
                                    copy,
                                    ...item.components.slice(index + 1),
                                  ],
                                }
                              : item,
                          ),
                        });
                        setSelectedSectionId(section.id);
                        setSelectedComponentId(copy.id);
                      }}
                      onRemoveComponent={(component) => {
                        if (componentCount() <= 1)
                          return toast.error("Keep at least one component");
                        commit({
                          ...draft,
                          sections: draft.sections.map((item) =>
                            item.id === section.id
                              ? {
                                  ...item,
                                  components: item.components.filter(
                                    (entry) => entry.id !== component.id,
                                  ),
                                }
                              : item,
                          ),
                        });
                        setSelectedComponentId(undefined);
                      }}
                      onToggle={() => updateSection({ ...section, enabled: !section.enabled })}
                      onDuplicate={() => {
                        if (draft.sections.length >= 20)
                          return toast.error("Use no more than 20 sections");
                        if (componentCount() + section.components.length > 30)
                          return toast.error("Use no more than 30 components");
                        const copy = {
                          ...structuredClone(section),
                          id: crypto.randomUUID(),
                          name: `${section.name} copy`,
                          components: section.components.map((component) => ({
                            ...component,
                            id: crypto.randomUUID(),
                          })),
                        };
                        const index = draft.sections.findIndex((item) => item.id === section.id);
                        commit({
                          ...draft,
                          sections: [
                            ...draft.sections.slice(0, index + 1),
                            copy,
                            ...draft.sections.slice(index + 1),
                          ],
                        });
                        setSelectedSectionId(copy.id);
                        setSelectedComponentId(undefined);
                      }}
                      onRemove={() => {
                        if (draft.sections.length <= 1)
                          return toast.error("Keep at least one section");
                        if (componentCount() - section.components.length < 1)
                          return toast.error("Keep at least one component on the page");
                        if (
                          section.components.length &&
                          !window.confirm(
                            `Delete ${section.name} and its ${section.components.length} components?`,
                          )
                        )
                          return;
                        const nextSections = draft.sections.filter(
                          (item) => item.id !== section.id,
                        );
                        commit({ ...draft, sections: nextSections });
                        setSelectedSectionId(nextSections[0]?.id);
                        setSelectedComponentId(undefined);
                      }}
                      device={device}
                    />
                  ))}
                </SortableContext>
                {draft.commerce.orderingEnabled && hasOrderableItems && (
                  <button
                    type="button"
                    className={`absolute bottom-5 z-30 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-xl ${
                      draft.commerce.cartButtonPosition === "BOTTOM_LEFT" ? "left-5" : "right-5"
                    }`}
                    style={{ background: draft.theme.primaryColor }}
                    onClick={() => setCommerceSettingsOpen(true)}
                  >
                    <Icon icon="solar:cart-large-2-linear" />
                    {draft.commerce.cartButtonLabel}
                    <span className="grid size-5 place-items-center rounded-full bg-white text-[10px] text-stone-900">
                      0
                    </span>
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card className="h-fit max-h-[calc(100vh-6rem)] overflow-y-auto p-4 xl:sticky xl:top-20">
            {selected ? (
              <ComponentSettings
                component={selected}
                menuItems={builder.data.menuItems}
                catalogItems={builder.data.catalogItems ?? []}
                onChange={updateComponent}
              />
            ) : (
              <SectionSettings
                section={selectedSection}
                theme={draft.theme}
                onChange={updateSection}
              />
            )}
          </Card>
        </div>
        <FloatingComponentToolbar
          key={draft._id}
          sections={draft.sections}
          selectedSectionId={selectedSectionId}
          componentCount={componentCount()}
          dragging={Boolean(activePaletteType)}
          onSelectSection={(id) => {
            setSelectedSectionId(id);
            setSelectedComponentId(undefined);
          }}
          onAdd={addComponent}
        />
      </div>
      {createPortal(
        <DragOverlay dropAnimation={null} zIndex={45}>
          {activePaletteType && (
            <div className="pointer-events-none flex w-44 items-center gap-3 rounded-xl border border-pink-300 bg-white p-3 text-sm font-semibold text-pink-800 shadow-xl">
              <Icon
                icon={
                  componentChoices.find((choice) => choice.type === activePaletteType)?.icon ??
                  "solar:add-circle-linear"
                }
                className="size-5"
              />
              {componentChoices.find((choice) => choice.type === activePaletteType)?.label}
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogTitle>Landing-page settings</DialogTitle>
          <DialogDescription>
            Set the public address and browser/search description.
          </DialogDescription>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const values = Object.fromEntries(new FormData(event.currentTarget));
              saveSettings.mutate(values);
            }}
          >
            <Field label="Site title">
              <Input name="siteTitle" defaultValue={page.siteTitle} required />
            </Field>
            <Field label="Public page address">
              <Input name="slug" defaultValue={page.slug} required />
              <p className="mt-2 break-all text-xs text-stone-500">
                Published as {getPublicSiteUrl(page.slug)}
              </p>
            </Field>
            <Field label="Search description">
              <textarea
                name="seoDescription"
                className={textAreaClass}
                defaultValue={page.seoDescription}
                maxLength={240}
              />
            </Field>
            <Button className="w-full" disabled={saveSettings.isPending}>
              Save settings
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={commerceSettingsOpen} onOpenChange={setCommerceSettingsOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogTitle>Cart & checkout settings</DialogTitle>
          <DialogDescription>
            Control ordering, fulfillment, fees, and the floating cart for this variant.
          </DialogDescription>
          <div className="mt-5 space-y-5">
            <label className="flex items-start gap-3 rounded-xl border border-pink-100 p-4">
              <input
                type="checkbox"
                className="mt-1"
                checked={draft.commerce.orderingEnabled}
                onChange={(event) =>
                  commit({
                    ...draft,
                    commerce: { ...draft.commerce, orderingEnabled: event.target.checked },
                  })
                }
              />
              <span>
                <span className="block font-semibold">Enable online ordering</span>
                <span className="text-sm text-stone-500">
                  Shows Add to cart controls and accepts orders from the published page.
                </span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cart button label">
                <Input
                  value={draft.commerce.cartButtonLabel}
                  maxLength={30}
                  onChange={(event) =>
                    commit({
                      ...draft,
                      commerce: { ...draft.commerce, cartButtonLabel: event.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Cart button position">
                <Select
                  value={draft.commerce.cartButtonPosition}
                  onValueChange={(value) =>
                    commit({
                      ...draft,
                      commerce: {
                        ...draft.commerce,
                        cartButtonPosition:
                          value as LandingPageVariant["commerce"]["cartButtonPosition"],
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOTTOM_RIGHT">Bottom right</SelectItem>
                    <SelectItem value="BOTTOM_LEFT">Bottom left</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div>
              <Label>Fulfillment and payment methods</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      fulfillment: "PICKUP",
                      payment: "PAY_ON_PICKUP",
                      title: "Pickup",
                      detail: "Customer pays when collecting the order.",
                    },
                    {
                      fulfillment: "DELIVERY",
                      payment: "CASH_ON_DELIVERY",
                      title: "Delivery",
                      detail: "Customer pays cash when the order arrives.",
                    },
                  ] as const
                ).map((option) => {
                  const checked = draft.commerce.fulfillmentMethods.includes(option.fulfillment);
                  return (
                    <label
                      key={option.fulfillment}
                      className="flex items-start gap-3 rounded-xl border border-pink-100 p-4"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() =>
                          commit({
                            ...draft,
                            commerce: {
                              ...draft.commerce,
                              fulfillmentMethods: checked
                                ? draft.commerce.fulfillmentMethods.filter(
                                    (method) => method !== option.fulfillment,
                                  )
                                : [...draft.commerce.fulfillmentMethods, option.fulfillment],
                              paymentMethods: checked
                                ? draft.commerce.paymentMethods.filter(
                                    (method) => method !== option.payment,
                                  )
                                : [...draft.commerce.paymentMethods, option.payment],
                            },
                          })
                        }
                      />
                      <span>
                        <span className="block font-semibold">{option.title}</span>
                        <span className="text-sm text-stone-500">{option.detail}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum order">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.commerce.minimumOrder}
                  onChange={(event) =>
                    commit({
                      ...draft,
                      commerce: {
                        ...draft.commerce,
                        minimumOrder: Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Delivery fee">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!draft.commerce.fulfillmentMethods.includes("DELIVERY")}
                  value={draft.commerce.deliveryFee}
                  onChange={(event) =>
                    commit({
                      ...draft,
                      commerce: { ...draft.commerce, deliveryFee: Number(event.target.value) },
                    })
                  }
                />
              </Field>
            </div>

            <Field label="Checkout instructions">
              <textarea
                className={textAreaClass}
                maxLength={500}
                value={draft.commerce.checkoutInstructions}
                onChange={(event) =>
                  commit({
                    ...draft,
                    commerce: { ...draft.commerce, checkoutInstructions: event.target.value },
                  })
                }
              />
            </Field>
            {draft.commerce.orderingEnabled && !draft.commerce.fulfillmentMethods.length && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Select pickup or delivery before saving this enabled storefront.
              </p>
            )}
            <Button className="w-full" onClick={() => setCommerceSettingsOpen(false)}>
              Done — remember to save draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}
