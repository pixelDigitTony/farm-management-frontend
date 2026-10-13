import type { LandingPageVariant } from "@/types/landing-page";

// Keep structural edits saveable without leaving navigation pointing at removed content.
// This runs as part of the same history entry, so Undo restores the links too.
export function reconcileSectionLinks(previous: LandingPageVariant, next: LandingPageVariant) {
  if (next.schemaVersion !== 2) return next;
  const anchors = (doc: LandingPageVariant) =>
    new Set(
      doc.sections
        .filter((section) => section.enabled)
        .flatMap((section) => [section.id, ...(section.anchor ? [section.anchor] : [])]),
    );
  const current = anchors(next);
  const removed = new Set([...anchors(previous)].filter((id) => !current.has(id)));
  if (!removed.size) return next;
  const renamed = new Map<string, string>();
  for (const before of previous.sections) {
    const after = next.sections.find((section) => section.id === before.id && section.enabled);
    if (before.anchor && removed.has(before.anchor) && after)
      renamed.set(before.anchor, after.anchor || after.id);
  }
  const destination = (id: string) => renamed.get(id) ?? (removed.has(id) ? undefined : id);
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit).filter((item) => item !== undefined);
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    if (record.kind === "SECTION") {
      const sectionId = destination(String(record.sectionId));
      return sectionId ? { ...record, sectionId } : undefined;
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
      if (
        (key.endsWith("Url") || key === "url") &&
        typeof item === "string" &&
        item.startsWith("#")
      ) {
        const id = destination(item.slice(1));
        if (!id && record.kind === "LINK") return undefined;
        result[key] = id ? `#${id}` : "";
      } else {
        const updated = visit(item);
        if (key === "target" && updated === undefined) return undefined;
        if (updated !== undefined) result[key] = updated;
      }
    }
    return result;
  }
  return {
    ...next,
    sections: next.sections.map((section) => ({
      ...section,
      components: section.components.map((block) => ({ ...block, content: visit(block.content) })),
    })),
  } as LandingPageVariant;
}
