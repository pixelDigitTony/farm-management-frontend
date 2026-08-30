import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { LandingPageComponentView } from "@/components/landing-page/LandingPageRenderer";
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
  LandingPageVariant,
} from "@/types/landing-page";
import { createLandingComponent } from "@/types/landing-page";
import { Header } from "./PigsPage";

const componentChoices: Array<{ type: LandingPageComponentType; label: string; icon: string }> = [
  { type: "HERO", label: "Hero", icon: "solar:star-fall-linear" },
  { type: "TEXT", label: "Text", icon: "solar:text-square-linear" },
  { type: "MENU", label: "Menu", icon: "solar:notebook-bookmark-linear" },
  { type: "GALLERY", label: "Gallery", icon: "solar:gallery-wide-linear" },
  { type: "CONTACT", label: "Contact", icon: "solar:phone-calling-linear" },
  { type: "CTA", label: "Call to action", icon: "solar:cursor-square-linear" },
];

function PaletteItem({ choice }: { choice: (typeof componentChoices)[number] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette:${choice.type}`,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className="flex w-full items-center gap-3 rounded-xl border border-pink-100 bg-white px-3 py-3 text-left text-sm font-semibold shadow-sm hover:border-pink-300 hover:bg-pink-50"
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }}
      {...listeners}
      {...attributes}
    >
      <Icon icon={choice.icon} className="size-5 text-pink-700" />
      {choice.label}
      <Icon icon="solar:hamburger-menu-linear" className="ml-auto text-stone-300" />
    </button>
  );
}

function SortableComponent({
  component,
  variant,
  menuItems,
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
      className={`group relative border-2 transition-colors ${selected ? "border-pink-600" : "border-transparent hover:border-pink-300"} ${component.enabled ? "" : "opacity-45"} ${device === "MOBILE" || component.width === "FULL" ? "col-span-12" : device === "TABLET" || component.width === "HALF" ? "col-span-6" : "col-span-4"}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
    >
      <button
        type="button"
        aria-label={`Edit ${component.type.toLowerCase()} component`}
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={onSelect}
      />
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
        theme={variant.theme}
        previewDevice={device}
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
  onChange,
}: {
  component?: LandingPageComponent;
  menuItems: LandingPageBuilderData["menuItems"];
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
            {["FULL", "HALF", "THIRD"].map((value) => (
              <SelectItem key={value} value={value}>
                {value}
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

export function LandingPageBuilderPage() {
  const queryClient = useQueryClient();
  const [variantId, setVariantId] = useState("");
  const [draft, setDraft] = useState<LandingPageVariant>();
  const [selectedComponentId, setSelectedComponentId] = useState<string>();
  const [device, setDevice] = useState<"DESKTOP" | "TABLET" | "MOBILE">("DESKTOP");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const undoStack = useRef<LandingPageVariant[]>([]);
  const redoStack = useRef<LandingPageVariant[]>([]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const { setNodeRef: setCanvasRef } = useDroppable({ id: "builder-canvas" });

  const builder = useQuery({
    queryKey: ["landing-page-builder"],
    queryFn: () => api<LandingPageBuilderData>("/landing-page"),
  });
  useEffect(() => {
    if (!builder.data?.variants.length || draft) return;
    const first = builder.data.variants[0];
    if (!first) return;
    setVariantId(first._id);
    setDraft(structuredClone(first));
  }, [builder.data, draft]);

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
    setSelectedComponentId(undefined);
    setDirty(false);
    undoStack.current = [];
    redoStack.current = [];
  }
  function updateComponent(component: LandingPageComponent) {
    if (!draft) return;
    commit({
      ...draft,
      components: draft.components.map((item) => (item.id === component.id ? component : item)),
    });
  }
  function onDragEnd(event: DragEndEvent) {
    if (!draft || !event.over) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    if (activeId.startsWith("palette:")) {
      const component = createLandingComponent(
        activeId.replace("palette:", "") as LandingPageComponentType,
      );
      const index = draft.components.findIndex((item) => item.id === overId);
      const next = [...draft.components];
      next.splice(index >= 0 ? index : next.length, 0, component);
      commit({ ...draft, components: next });
      setSelectedComponentId(component.id);
      return;
    }
    if (activeId === overId) return;
    const oldIndex = draft.components.findIndex((item) => item.id === activeId);
    const newIndex = draft.components.findIndex((item) => item.id === overId);
    if (oldIndex >= 0 && newIndex >= 0)
      commit({ ...draft, components: arrayMove(draft.components, oldIndex, newIndex) });
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["landing-page-builder"] });
  const initialize = useMutation({
    mutationFn: () => api<LandingPageBuilderData>("/landing-page", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["landing-page-builder"], data);
      toast.success("Landing-page builder created");
    },
    onError: (error) => toast.error(error.message),
  });
  const save = useMutation({
    mutationFn: (variant: LandingPageVariant) =>
      api<LandingPageVariant>(`/landing-page/variants/${variant._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: variant.name,
          theme: variant.theme,
          components: variant.components,
        }),
      }),
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
            components: variant.components,
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
    mutationFn: ({ name, source }: { name: string; source?: string }) =>
      api<LandingPageVariant>("/landing-page/variants", {
        method: "POST",
        body: JSON.stringify({ name, duplicateFromId: source }),
      }),
    onSuccess: (created) => {
      void refresh();
      setVariantId(created._id);
      setDraft(structuredClone(created));
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
  const selected = draft.components.find((item) => item.id === selectedComponentId);
  const previewWidth =
    device === "MOBILE" ? "max-w-[390px]" : device === "TABLET" ? "max-w-[760px]" : "max-w-full";

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="space-y-5">
        <Header
          title="Landing page builder"
          description="Drag components into the live preview, save variants, and publish when ready."
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Icon icon="solar:settings-linear" /> Page settings
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
            <Icon icon="solar:add-circle-linear" /> New
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
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Components</p>
            <p className="mt-1 text-sm text-stone-500">Drag into the preview</p>
            <div className="mt-4 space-y-2">
              {componentChoices.map((choice) => (
                <PaletteItem key={choice.type} choice={choice} />
              ))}
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
                ref={setCanvasRef}
                className={`mx-auto grid min-h-[640px] grid-cols-12 content-start overflow-hidden bg-white shadow-xl transition-[max-width] ${previewWidth}`}
              >
                <SortableContext
                  items={draft.components.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {draft.components.map((component) => (
                    <SortableComponent
                      key={component.id}
                      component={component}
                      variant={draft}
                      menuItems={builder.data.menuItems}
                      selected={selectedComponentId === component.id}
                      onSelect={() => setSelectedComponentId(component.id)}
                      onToggle={() =>
                        updateComponent({ ...component, enabled: !component.enabled })
                      }
                      onDuplicate={() => {
                        const copy = { ...structuredClone(component), id: crypto.randomUUID() };
                        const index = draft.components.findIndex(
                          (item) => item.id === component.id,
                        );
                        commit({
                          ...draft,
                          components: [
                            ...draft.components.slice(0, index + 1),
                            copy,
                            ...draft.components.slice(index + 1),
                          ],
                        });
                        setSelectedComponentId(copy.id);
                      }}
                      onRemove={() => {
                        if (draft.components.length <= 1)
                          return toast.error("Keep at least one component");
                        commit({
                          ...draft,
                          components: draft.components.filter((item) => item.id !== component.id),
                        });
                        setSelectedComponentId(undefined);
                      }}
                      device={device}
                    />
                  ))}
                </SortableContext>
              </div>
            </div>
          </Card>

          <Card className="h-fit max-h-[calc(100vh-6rem)] overflow-y-auto p-4 xl:sticky xl:top-20">
            <ComponentSettings
              component={selected}
              menuItems={builder.data.menuItems}
              onChange={updateComponent}
            />
          </Card>
        </div>
      </div>

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
    </DndContext>
  );
}
