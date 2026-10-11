import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { blockRegistry } from "@/lib/landing-page/registry";
import type { LandingPageComponent, LandingPageSection } from "@/types/landing-page";
import { LandingIcon as Icon } from "../LandingIcon";

function Row({
  id,
  label,
  selected,
  hidden,
  onSelect,
  onToggle,
  onDuplicate,
  onDelete,
  onMove,
  canUp,
  canDown,
  icon,
}: {
  id: string;
  label: string;
  selected: boolean;
  hidden: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (direction: number) => void;
  canUp: boolean;
  canDown: boolean;
  icon?: string;
}) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`lb-tree-row ${selected ? "lb-tree-selected" : ""} ${hidden ? "lb-tree-hidden" : ""}`}
    >
      <button
        type="button"
        className="lb-tree-drag"
        aria-label={`Drag ${label}`}
        {...attributes}
        {...listeners}
      >
        <Icon icon="solar:hamburger-menu-linear" />
      </button>
      <button type="button" className="lb-tree-label" aria-pressed={selected} onClick={onSelect}>
        {icon && <Icon icon={icon} />}
        <span>{label}</span>
      </button>
      <div className="lb-tree-actions">
        <button
          type="button"
          aria-label={`Move ${label} up`}
          disabled={!canUp}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move ${label} down`}
          disabled={!canDown}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label={`${hidden ? "Show" : "Hide"} ${label}`}
          onClick={onToggle}
        >
          <Icon icon={hidden ? "solar:eye-closed-linear" : "solar:eye-linear"} />
        </button>
        <button type="button" aria-label={`Duplicate ${label}`} onClick={onDuplicate}>
          <Icon icon="solar:copy-linear" />
        </button>
        <button type="button" aria-label={`Delete ${label}`} onClick={onDelete}>
          <Icon icon="solar:trash-bin-trash-linear" />
        </button>
      </div>
    </div>
  );
}
export function SectionTree({
  sections,
  selectedSection,
  selectedBlock,
  onSelect,
  onSection,
  onBlock,
  onDrag,
}: {
  sections: LandingPageSection[];
  selectedSection?: string;
  selectedBlock?: string;
  onSelect: (sectionId: string, blockId?: string) => void;
  onSection: (
    id: string,
    action: "toggle" | "duplicate" | "delete" | "move",
    direction?: number,
  ) => void;
  onBlock: (
    sectionId: string,
    id: string,
    action: "toggle" | "duplicate" | "delete" | "move",
    direction?: number,
  ) => void;
  onDrag: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext sensors={sensors} onDragEnd={onDrag}>
      <SortableContext
        items={sections.map((s) => `section:${s.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {sections.map((s, index) => (
          <section key={s.id} className="lb-tree-section">
            <Row
              id={`section:${s.id}`}
              label={s.name}
              selected={selectedSection === s.id && !selectedBlock}
              hidden={!s.enabled}
              onSelect={() => onSelect(s.id)}
              onToggle={() => onSection(s.id, "toggle")}
              onDuplicate={() => onSection(s.id, "duplicate")}
              onDelete={() => onSection(s.id, "delete")}
              onMove={(d) => onSection(s.id, "move", d)}
              canUp={index > 0}
              canDown={index < sections.length - 1}
            />
            <SortableContext
              items={s.components.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="lb-tree-blocks">
                {s.components.map((c, i) => (
                  <Row
                    key={c.id}
                    id={c.id}
                    label={blockLabel(c)}
                    icon={blockRegistry[c.type].icon}
                    selected={selectedBlock === c.id}
                    hidden={!c.enabled}
                    onSelect={() => onSelect(s.id, c.id)}
                    onToggle={() => onBlock(s.id, c.id, "toggle")}
                    onDuplicate={() => onBlock(s.id, c.id, "duplicate")}
                    onDelete={() => onBlock(s.id, c.id, "delete")}
                    onMove={(d) => onBlock(s.id, c.id, "move", d)}
                    canUp={i > 0}
                    canDown={i < s.components.length - 1}
                  />
                ))}
              </div>
            </SortableContext>
          </section>
        ))}
      </SortableContext>
    </DndContext>
  );
}
function blockLabel(c: LandingPageComponent) {
  const content = c.content as Record<string, unknown>;
  const text = String(content.heading ?? content.title ?? content.brand ?? "");
  return `${blockRegistry[c.type].label}${text ? " · " + text.slice(0, 22) : ""}`;
}
