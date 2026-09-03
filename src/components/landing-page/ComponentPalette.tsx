import { useDraggable } from "@dnd-kit/core";
import { Icon } from "@iconify/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LandingPageComponentType, LandingPageSection } from "@/types/landing-page";

export const componentChoices: Array<{
  type: LandingPageComponentType;
  label: string;
  icon: string;
}> = [
  { type: "HERO", label: "Hero", icon: "solar:star-fall-linear" },
  { type: "TEXT", label: "Text", icon: "solar:text-square-linear" },
  { type: "MENU", label: "Menu", icon: "solar:notebook-bookmark-linear" },
  { type: "CATALOG", label: "Product catalog", icon: "solar:shop-2-linear" },
  { type: "GALLERY", label: "Gallery", icon: "solar:gallery-wide-linear" },
  { type: "CONTACT", label: "Contact", icon: "solar:phone-calling-linear" },
  { type: "CTA", label: "Call to action", icon: "solar:cursor-square-linear" },
];

export function PaletteItem({
  choice,
  onAdd,
  source = "sidebar",
  disabled = false,
}: {
  choice: (typeof componentChoices)[number];
  onAdd: () => void;
  source?: "sidebar" | "floating";
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${source}:${choice.type}`,
    data: { componentType: choice.type },
    disabled,
  });
  const floating = source === "floating";
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 items-center rounded-xl border border-pink-100 bg-white text-sm font-semibold shadow-sm ${disabled ? "opacity-40" : "hover:border-pink-300 hover:bg-pink-50"} ${floating ? "xl:flex-col" : "w-full"}`}
      style={{ opacity: isDragging ? 0.4 : undefined }}
    >
      <button
        type="button"
        disabled={disabled}
        className={`flex min-w-0 flex-1 items-center text-left disabled:cursor-not-allowed ${floating ? "gap-2 px-2 py-3 text-xs xl:w-full xl:flex-col xl:gap-1 xl:text-center" : "gap-3 px-3 py-3"}`}
        onClick={onAdd}
      >
        <Icon icon={choice.icon} className="size-5 shrink-0 text-pink-700" />
        <span>{choice.label}</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        className={`touch-none cursor-grab text-stone-400 hover:text-pink-700 active:cursor-grabbing disabled:cursor-not-allowed ${floating ? "p-3 xl:w-full xl:py-1.5" : "p-3"}`}
        aria-label={`Drag ${choice.label} component`}
        {...listeners}
        {...attributes}
      >
        <Icon icon="solar:hamburger-menu-linear" className="mx-auto" />
      </button>
    </div>
  );
}

export function FloatingComponentToolbar({
  sections,
  selectedSectionId,
  onSelectSection,
  onAdd,
  componentCount,
  dragging,
}: {
  sections: LandingPageSection[];
  selectedSectionId?: string;
  onSelectSection: (id: string) => void;
  onAdd: (type: LandingPageComponentType, sectionId: string) => void;
  componentCount: number;
  dragging: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const target = sections.find((section) => section.id === selectedSectionId) ?? sections[0];
  function openToolbar() {
    const atBottom =
      document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 24;
    const visible = sections.flatMap((section) => {
      const rect = document
        .getElementById(`builder-section-${section.id}`)
        ?.getBoundingClientRect();
      return rect && rect.bottom > 80 && rect.top < window.innerHeight - 80
        ? [{ section, rect }]
        : [];
    });
    if (!visible.some(({ section }) => section.id === selectedSectionId)) {
      const nearest = visible.sort(
        (left, right) =>
          Math.abs((left.rect.top + left.rect.bottom) / 2 - window.innerHeight / 2) -
          Math.abs((right.rect.top + right.rect.bottom) / 2 - window.innerHeight / 2),
      )[0];
      if (nearest) onSelectSection(nearest.section.id);
    }
    setOpen(true);
    if (atBottom)
      requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  }
  return (
    <div
      className={`pointer-events-none sticky bottom-[calc(1rem_+_env(safe-area-inset-bottom))] z-30 flex pt-3 ${open ? "justify-center" : "justify-end"}`}
    >
      <section
        id="floating-component-toolbar"
        aria-label="Floating component toolbar"
        className={`pointer-events-auto rounded-2xl border border-pink-200 bg-white/95 shadow-xl backdrop-blur ${open ? "w-full max-w-5xl p-3" : "p-1"}`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dragging) {
            event.stopPropagation();
            setOpen(false);
            toggle.current?.focus();
          }
        }}
      >
        <div className={`flex items-center gap-3 ${open ? "justify-between" : ""}`}>
          {open && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-pink-800">Add a component</p>
              <p className="text-xs text-stone-500">
                Click to add, or drag the handle into any section.
              </p>
            </div>
          )}
          <Button
            ref={toggle}
            type="button"
            size={open ? "icon" : "default"}
            variant={open ? "ghost" : "default"}
            aria-label={open ? "Close component toolbar" : "Add component"}
            aria-expanded={open}
            aria-controls="floating-component-options"
            onClick={() => (open ? setOpen(false) : openToolbar())}
          >
            <Icon icon={open ? "solar:close-circle-linear" : "solar:add-circle-linear"} />
            {!open && "Add component"}
          </Button>
        </div>
        <div id="floating-component-options" hidden={!open}>
          {open && (
            <>
              <div className="my-3 flex items-center gap-2">
                <span className="shrink-0 text-xs font-semibold text-stone-500">Add to</span>
                <Select value={target?.id} onValueChange={onSelectSection}>
                  <SelectTrigger aria-label="Destination section" className="h-9 min-w-0 max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-52 overflow-y-auto">
                    {sections.map((section, index) => (
                      <SelectItem key={section.id} value={section.id}>
                        {index + 1}. {section.name}
                        {section.enabled ? "" : " (hidden)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="ml-auto shrink-0 text-xs text-stone-400">{componentCount}/30</span>
              </div>
              <div className="grid max-h-[min(35dvh,18rem)] grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-4 xl:grid-cols-7">
                {componentChoices.map((choice) => (
                  <PaletteItem
                    key={choice.type}
                    choice={choice}
                    source="floating"
                    disabled={componentCount >= 30 || !target}
                    onAdd={() => {
                      if (target) onAdd(choice.type, target.id);
                    }}
                  />
                ))}
              </div>
              {componentCount >= 30 && (
                <p className="mt-2 text-xs text-stone-500">
                  Component limit reached. Remove a component to add another.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
