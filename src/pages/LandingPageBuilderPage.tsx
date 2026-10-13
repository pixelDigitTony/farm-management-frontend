import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import * as v from "valibot";
import { api, sessionUserStore } from "@/api/client";
import {
  BackgroundInspector,
  BlockInspector,
  ColorField,
  InspectorField,
  InspectorSelect,
} from "@/components/landing-page/editor/Inspector";
import { PreviewFrame } from "@/components/landing-page/editor/PreviewFrame";
import { SectionTree } from "@/components/landing-page/editor/SectionTree";
import { LandingIcon as Icon } from "@/components/landing-page/LandingIcon";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { blockRegistry } from "@/lib/landing-page/registry";
import { landingPageVariantUpdateSchema } from "@/lib/landing-page/schema";
import { reconcileSectionLinks } from "@/lib/landing-page/section-links";
import { canAccess } from "@/lib/permissions";
import { getPublicSiteUrl } from "@/lib/public-site";
import {
  createLandingComponent,
  createLandingSection,
  type LandingGoal,
  type LandingPageBuilderData,
  type LandingPageComponent,
  type LandingPageComponentType,
  type LandingPageSection,
  type LandingPageVariant,
  type LandingPageVariantPayload,
  type LandingTemplate,
  normalizeLandingPageVariant,
} from "@/types/landing-page";
import "@/components/landing-page/editor/builder.css";

type Payload = Omit<LandingPageBuilderData, "variants"> & {
  variants: LandingPageVariantPayload[];
  capabilities?: { schemaVersions: number[]; templates: boolean };
};
type DialogState = {
  kind: "new" | "duplicate" | "rename" | "reset" | "delete" | "template" | "settings";
  template?: LandingTemplate;
};
function documentBody(d: LandingPageVariant) {
  return {
    name: d.name,
    schemaVersion: d.schemaVersion,
    template: d.template,
    goal: d.goal,
    theme: d.theme,
    commerce: d.commerce,
    sections: d.sections,
  };
}
export function LandingPageBuilderPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LandingPageVariant>();
  const latest = useRef(draft);
  latest.current = draft;
  const [sectionId, setSectionId] = useState<string>();
  const [blockId, setBlockId] = useState<string>();
  const [leftTab, setLeftTab] = useState<"Sections" | "Add" | "Templates">("Sections");
  const [inspector, setInspector] = useState<"Selection" | "Theme" | "Commerce">("Selection");
  const [width, setWidth] = useState(1440);
  const [preview, setPreview] = useState(false);
  const [motionOff, setMotionOff] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  useEffect(() => {
    const closePanel = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
      if (matchMedia("(max-width:1279px)").matches && (leftOpen || rightOpen)) {
        setLeftOpen(false);
        setRightOpen(false);
        document
          .querySelector<HTMLButtonElement>(
            `[aria-controls="${rightOpen ? "landing-inspector" : "landing-sections"}"]`,
          )
          ?.focus();
      }
    };
    window.addEventListener("keydown", closePanel);
    return () => window.removeEventListener("keydown", closePanel);
  }, [leftOpen, rightOpen]);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<LandingGoal>("SHOP");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [mutationError, setMutationError] = useState("");
  const undo = useRef<LandingPageVariant[]>([]);
  const redo = useRef<LandingPageVariant[]>([]);
  const canEdit = canAccess(sessionUserStore.get(), "landing-page", "edit");
  const canCreate = canAccess(sessionUserStore.get(), "landing-page", "create");
  const canDelete = canAccess(sessionUserStore.get(), "landing-page", "delete");
  const builder = useQuery({
    queryKey: ["landing-page-builder"],
    queryFn: async () => {
      const data = await api<Payload>("/landing-page");
      return { ...data, variants: data.variants.map(normalizeLandingPageVariant) };
    },
  });
  const templates = useQuery({
    queryKey: ["landing-page-templates"],
    queryFn: () =>
      api<{ templates: LandingTemplate[]; schemaVersion: number }>("/landing-page/templates"),
  });
  const autosave = useDraftAutosave(async (doc: LandingPageVariant) => {
    const parsed = v.safeParse(landingPageVariantUpdateSchema, documentBody(doc));
    if (!parsed.success)
      throw new Error(
        parsed.issues[0]?.message ?? "Complete the required fields before this draft can save",
      );
    const saved = normalizeLandingPageVariant(
      await api<LandingPageVariantPayload>(`/landing-page/variants/${doc._id}`, {
        method: "PATCH",
        body: JSON.stringify(parsed.output),
      }),
    );
    queryClient.setQueryData<LandingPageBuilderData>(["landing-page-builder"], (current) =>
      current
        ? { ...current, variants: current.variants.map((x) => (x._id === saved._id ? saved : x)) }
        : current,
    );
  });
  const selectDraft = useCallback((doc: LandingPageVariant) => {
    setDraft(structuredClone(doc));
    setSectionId(doc.sections[0]?.id);
    setBlockId(undefined);
    undo.current = [];
    redo.current = [];
  }, []);
  useEffect(() => {
    if (draft || !builder.data?.variants.length) return;
    selectDraft(builder.data.variants[0]!);
  }, [builder.data, draft, selectDraft]);
  function commit(next: LandingPageVariant) {
    if (locked.current || !canEdit) return;
    if (next.schemaVersion === 2) {
      const visible = next.sections
        .filter((s) => s.enabled)
        .flatMap((s) => s.components.filter((c) => c.enabled));
      if (
        visible.filter((c) => c.type === "HEADER").length > 1 ||
        visible.filter((c) => c.type === "FOOTER").length > 1 ||
        (visible.some((c) => c.type === "HEADER") && visible[0]?.type !== "HEADER") ||
        (visible.some((c) => c.type === "FOOTER") && visible.at(-1)?.type !== "FOOTER")
      )
        return toast.error(
          "Keep one header first and one footer last. Move the other sections between them.",
        );
      if (visible.filter((c) => c.appearance?.orderPresentation === "INLINE_SUMMARY").length > 1)
        return toast.error(
          "Use one inline order summary. Change the other catalog to the default ordering layout.",
        );
      if (
        next.commerce.contactBlockId &&
        !visible.some((c) => c.type === "CONTACT" && c.id === next.commerce.contactBlockId)
      )
        next = { ...next, commerce: { ...next.commerce, contactBlockId: undefined } };
    }
    const current = latest.current;
    if (current) next = reconcileSectionLinks(current, next);
    if (current && JSON.stringify(current) === JSON.stringify(next)) return;
    if (current) undo.current = [...undo.current, structuredClone(current)].slice(-100);
    redo.current = [];
    latest.current = next;
    setDraft(next);
    autosave.schedule(next);
  }
  function history(direction: "undo" | "redo") {
    if (locked.current || !latest.current || !canEdit) return;
    const source = direction === "undo" ? undo : redo;
    const destination = direction === "undo" ? redo : undo;
    const next = source.current.pop();
    if (!next) return;
    destination.current.push(structuredClone(latest.current));
    latest.current = next;
    setDraft(next);
    autosave.schedule(next);
  }
  const historyHandler = useRef(history);
  historyHandler.current = history;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z")
        return;
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true]")) return;
      event.preventDefault();
      historyHandler.current(event.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function mutate(task: () => Promise<void>, discard = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMutationError("");
    try {
      if (discard) await autosave.discard();
      else if (!(await autosave.flush()))
        throw new Error("Fix the draft save error before continuing");
      await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : "This action failed";
      setMutationError(message);
      toast.error(message);
      if (discard && latest.current) autosave.schedule(latest.current);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["landing-page-builder"] });
  }
  function updateBlock(next: LandingPageComponent) {
    if (!draft) return;
    commit({
      ...draft,
      sections: draft.sections.map((s) => ({
        ...s,
        components: s.components.map((c) => (c.id === next.id ? next : c)),
      })),
    });
  }
  function updateSection(next: LandingPageSection) {
    if (draft)
      commit({ ...draft, sections: draft.sections.map((s) => (s.id === next.id ? next : s)) });
  }
  function select(section: string, block?: string) {
    setSectionId(section);
    setBlockId(block);
    setInspector("Selection");
    setRightOpen(true);
    setLeftOpen(false);
  }
  function focusTree() {
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(".lb-tree-selected .lb-tree-label")?.focus(),
    );
  }
  const count = draft?.sections.reduce((n, s) => n + s.components.length, 0) ?? 0;
  function sectionAction(
    id: string,
    action: "toggle" | "duplicate" | "delete" | "move",
    direction = 0,
  ) {
    if (!draft) return;
    const index = draft.sections.findIndex((s) => s.id === id);
    const s = draft.sections[index];
    if (!s) return;
    let sections = draft.sections;
    setSectionId(id);
    setBlockId(undefined);
    if (action === "toggle")
      sections = sections.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x));
    if (action === "move")
      sections = arrayMove(
        sections,
        index,
        Math.max(0, Math.min(sections.length - 1, index + direction)),
      );
    if (action === "duplicate") {
      if (sections.length >= 20 || count + s.components.length > 30)
        return toast.error("This copy would exceed the document limits");
      if (s.components.some((c) => c.type === "HEADER" || c.type === "FOOTER"))
        return toast.error("Keep one header and one footer");
      const copy = {
        ...structuredClone(s),
        id: crypto.randomUUID(),
        anchor: undefined,
        name: `${s.name} copy`.slice(0, 80),
        components: s.components.map((c) => ({
          ...structuredClone(c),
          id: crypto.randomUUID(),
          appearance: c.appearance
            ? {
                ...c.appearance,
                orderPresentation:
                  c.appearance.orderPresentation === "INLINE_SUMMARY"
                    ? ("DEFAULT" as const)
                    : c.appearance.orderPresentation,
              }
            : undefined,
        })),
      };
      sections = [...sections.slice(0, index + 1), copy, ...sections.slice(index + 1)];
      setSectionId(copy.id);
      setBlockId(undefined);
    }
    if (action === "delete") {
      if (count - s.components.length < 1)
        return toast.error("Keep at least one block in the page");
      if (sections.length === 1) return toast.error("Keep at least one section");
      sections = sections.filter((x) => x.id !== id);
      setSectionId(sections[Math.min(index, sections.length - 1)]?.id);
      setBlockId(undefined);
    }
    commit({ ...draft, sections });
    focusTree();
  }
  function blockAction(
    sid: string,
    id: string,
    action: "toggle" | "duplicate" | "delete" | "move",
    direction = 0,
  ) {
    if (!draft) return;
    const section = draft.sections.find((s) => s.id === sid);
    const index = section?.components.findIndex((c) => c.id === id) ?? -1;
    const block = section?.components[index];
    if (!section || !block) return;
    let components = section.components;
    setSectionId(sid);
    setBlockId(id);
    if (action === "toggle")
      components = components.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c));
    if (action === "move")
      components = arrayMove(
        components,
        index,
        Math.max(0, Math.min(components.length - 1, index + direction)),
      );
    if (action === "duplicate") {
      if (count >= 30) return toast.error("Use no more than 30 blocks");
      if (block.type === "HEADER" || block.type === "FOOTER")
        return toast.error("Keep one header and one footer");
      const copy = {
        ...structuredClone(block),
        id: crypto.randomUUID(),
        appearance: block.appearance
          ? {
              ...block.appearance,
              orderPresentation:
                block.appearance.orderPresentation === "INLINE_SUMMARY"
                  ? ("DEFAULT" as const)
                  : block.appearance.orderPresentation,
            }
          : undefined,
      };
      components = [...components.slice(0, index + 1), copy, ...components.slice(index + 1)];
      setBlockId(copy.id);
    }
    if (action === "delete") {
      if (count <= 1) return toast.error("Keep at least one block in the page");
      components = components.filter((c) => c.id !== id);
      setBlockId(components[Math.min(index, components.length - 1)]?.id);
    }
    updateSection({ ...section, components });
    focusTree();
  }
  function drag(event: DragEndEvent) {
    if (!draft || !event.over) return;
    const active = String(event.active.id),
      over = String(event.over.id);
    if (active === over) return;
    if (active.startsWith("section:") && over.startsWith("section:")) {
      const from = draft.sections.findIndex((s) => s.id === active.slice(8)),
        to = draft.sections.findIndex((s) => s.id === over.slice(8));
      if (from >= 0 && to >= 0) commit({ ...draft, sections: arrayMove(draft.sections, from, to) });
      return;
    }
    const from = draft.sections.find((s) => s.components.some((c) => c.id === active));
    const to = draft.sections.find(
      (s) => s.components.some((c) => c.id === over) || `section:${s.id}` === over,
    );
    const block = from?.components.find((c) => c.id === active);
    if (!from || !to || !block) return;
    if (from.id === to.id) {
      const a = from.components.findIndex((c) => c.id === active),
        b = from.components.findIndex((c) => c.id === over);
      if (b >= 0) updateSection({ ...from, components: arrayMove(from.components, a, b) });
    } else
      commit({
        ...draft,
        sections: draft.sections.map((s) =>
          s.id === from.id
            ? { ...s, components: s.components.filter((c) => c.id !== active) }
            : s.id === to.id
              ? { ...s, components: [...s.components, block] }
              : s,
        ),
      });
  }
  function add(type: LandingPageComponentType) {
    if (!draft || count >= 30) return;
    const block = createLandingComponent(type);
    const v2 = draft.schemaVersion === 2;
    if (
      v2 &&
      draft.sections.some((s) => s.components.some((c) => c.type === type)) &&
      (type === "HEADER" || type === "FOOTER")
    )
      return toast.error(`Keep one ${type.toLowerCase()}`);
    let target = draft.sections.find((s) => s.id === sectionId) ?? draft.sections[0];
    if (!target) return;
    if (type === "HEADER") target = draft.sections[0]!;
    if (type === "FOOTER") target = draft.sections.at(-1)!;
    const section = {
      ...target,
      components:
        type === "HEADER"
          ? [block, ...target.components]
          : [
              ...target.components.filter((c) => c.type !== "FOOTER"),
              block,
              ...target.components.filter((c) => c.type === "FOOTER"),
            ],
    };
    updateSection(section);
    setBlockId(block.id);
    setSectionId(section.id);
    setInspector("Selection");
    setRightOpen(true);
  }
  function openDialog(kind: DialogState["kind"], template?: LandingTemplate) {
    template ??=
      kind === "new"
        ? (templates.data?.templates.find((t) => t.id === draft?.template?.id) ??
          templates.data?.templates[0])
        : undefined;
    setMutationError("");
    setName(
      kind === "rename"
        ? (draft?.name ?? "")
        : kind === "duplicate"
          ? `${draft?.name ?? "Page"} copy`.slice(0, 80)
          : (template?.name ?? "New variant"),
    );
    setGoal(template?.goal ?? draft?.goal ?? "SHOP");
    setDialog({ kind, template });
  }
  async function submitDialog(event: React.FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    const action = dialog;
    await mutate(
      async () => {
        if (action.kind === "settings") {
          const data = new FormData(event.target as HTMLFormElement);
          await api("/landing-page/settings", {
            method: "PATCH",
            body: JSON.stringify(Object.fromEntries(data)),
          });
        } else if (action.kind === "rename") {
          if (!draft) return;
          const next = { ...draft, name: name.trim() };
          const saved = normalizeLandingPageVariant(
            await api<LandingPageVariantPayload>(`/landing-page/variants/${draft._id}`, {
              method: "PATCH",
              body: JSON.stringify(documentBody(next)),
            }),
          );
          selectDraft(saved);
        } else if (action.kind === "reset") {
          if (!draft) return;
          const saved = normalizeLandingPageVariant(
            await api<LandingPageVariantPayload>(`/landing-page/variants/${draft._id}/reset`, {
              method: "PATCH",
            }),
          );
          selectDraft(saved);
          toast.success("Variant reset");
        } else if (action.kind === "delete") {
          if (!draft) return;
          await api(`/landing-page/variants/${draft._id}`, { method: "DELETE" });
          const next = builder.data?.variants.find((d) => d._id !== draft._id);
          if (next) selectDraft(next);
        } else {
          const created = normalizeLandingPageVariant(
            await api<LandingPageVariantPayload>("/landing-page/variants", {
              method: "POST",
              body: JSON.stringify({
                name: name.trim(),
                ...(action.kind === "duplicate"
                  ? { duplicateFromId: draft?._id }
                  : action.template
                    ? {
                        templateId: action.template.id,
                        templateRevision: action.template.revision,
                        goal,
                      }
                    : {}),
              }),
            }),
          );
          selectDraft(created);
          toast.success("New draft variant created");
        }
        setDialog(undefined);
        await refresh();
      },
      action.kind === "reset" || action.kind === "delete",
    );
  }
  if (builder.isLoading) return <PageSkeleton cards={5} />;
  if (builder.isError)
    return <QueryError message={builder.error.message} retry={() => builder.refetch()} />;
  if (!builder.data?.page)
    return (
      <div className="lb-start">
        <Link to="/">← Back to workspace</Link>
        <Icon icon="solar:palette-round-linear" />
        <h1>Your next storefront starts here.</h1>
        <p>Create a workspace, choose a template and make it your own.</p>
        <Button
          disabled={busy || !canCreate}
          onClick={() =>
            void mutate(async () => {
              await api("/landing-page", { method: "POST" });
              await refresh();
            })
          }
        >
          Start building
        </Button>
      </div>
    );
  if (!draft) return <PageSkeleton />;
  const page = builder.data.page;
  const section = draft.sections.find((s) => s.id === sectionId);
  const block = section?.components.find((c) => c.id === blockId);
  const v2 = draft.schemaVersion === 2;
  const publishedChanges =
    page.isPublished &&
    (page.publishedVariantId !== draft._id ||
      autosave.status !== "saved" ||
      Date.parse(builder.data.variants.find((d) => d._id === draft._id)?.updatedAt ?? "") >
        Date.parse(page.publishedAt ?? ""));
  const filteredTemplates = (templates.data?.templates ?? []).filter((t) =>
    `${t.name} ${t.description} ${t.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className={`lb-workspace ${preview ? "lb-preview-mode" : ""}`}>
      <header className="lb-command">
        <Link to="/" className="lb-back" aria-label="Back to workspace">
          ←
        </Link>
        <div className="lb-command-identity">
          <span>Storefront studio</span>
          <select
            aria-label="Variant"
            value={draft._id}
            disabled={busy}
            onChange={(e) => {
              const id = e.currentTarget.value;
              void mutate(async () => {
                const next = queryClient
                  .getQueryData<LandingPageBuilderData>(["landing-page-builder"])
                  ?.variants.find((d) => d._id === id);
                if (next) selectDraft(next);
              });
            }}
          >
            {builder.data.variants.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <p className={`lb-save-status lb-save-${autosave.status}`} role="status" aria-live="polite">
          {autosave.status === "saved"
            ? "Draft saved"
            : autosave.status === "error"
              ? "Not saved"
              : autosave.status === "saving"
                ? "Saving…"
                : "Changes pending"}
          {autosave.status === "error" && (
            <button type="button" onClick={() => void autosave.flush()}>
              Retry
            </button>
          )}
        </p>
        <div className="lb-history">
          <button
            type="button"
            aria-label="Undo"
            disabled={busy || !canEdit || !undo.current.length}
            onClick={() => history("undo")}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Redo"
            disabled={busy || !canEdit || !redo.current.length}
            onClick={() => history("redo")}
          >
            ↷
          </button>
        </div>
        <fieldset className="lb-devices" aria-label="Preview device">
          {[
            [1440, "Desktop", "solar:monitor-linear"],
            [768, "Tablet", "solar:tablet-linear"],
            [390, "Mobile", "solar:smartphone-linear"],
          ].map(([w, label, icon]) => (
            <button
              type="button"
              key={w}
              aria-label={String(label)}
              aria-pressed={width === w}
              onClick={() => setWidth(Number(w))}
            >
              <Icon icon={String(icon)} />
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="lb-preview-toggle"
          aria-pressed={preview}
          onClick={() => {
            setPreview(!preview);
            setLeftOpen(false);
            setRightOpen(false);
          }}
        >
          {preview ? "Back to editing" : "Preview"}
        </button>
        <Button
          className="lb-publish"
          permission={{ path: "/landing-page/variants/id/publish", method: "POST" }}
          disabled={busy}
          onClick={() =>
            void mutate(async () => {
              await api(`/landing-page/variants/${draft._id}/publish`, { method: "POST" });
              await refresh();
              toast.success("Landing page published");
            })
          }
        >
          {busy ? "Working…" : "Publish"}
        </Button>
      </header>
      <div className="lb-subcommand">
        <div>
          <strong>{page.isPublished ? "Live" : "Unpublished"}</strong>
          {publishedChanges && <span> · Draft differs from live</span>}
          {page.isPublished && (
            <a href={getPublicSiteUrl(page.slug)} target="_blank" rel="noreferrer">
              View live ↗
            </a>
          )}
        </div>
        <div className="lb-variant-actions">
          <button type="button" disabled={!canCreate || busy} onClick={() => openDialog("new")}>
            New
          </button>
          <button
            type="button"
            disabled={!canCreate || busy}
            onClick={() => openDialog("duplicate")}
          >
            Duplicate
          </button>
          <button type="button" disabled={!canEdit || busy} onClick={() => openDialog("rename")}>
            Rename
          </button>
          <button type="button" disabled={!canEdit || busy} onClick={() => openDialog("reset")}>
            Reset
          </button>
          <button
            type="button"
            disabled={
              !canDelete ||
              busy ||
              builder.data.variants.length <= 1 ||
              page.publishedVariantId === draft._id
            }
            onClick={() => openDialog("delete")}
          >
            Delete
          </button>
          <button type="button" disabled={!canEdit || busy} onClick={() => openDialog("settings")}>
            Site settings
          </button>
          {page.isPublished && (
            <button
              type="button"
              disabled={!canEdit || busy}
              onClick={() =>
                void mutate(async () => {
                  await api("/landing-page/unpublish", { method: "POST" });
                  await refresh();
                })
              }
            >
              Unpublish
            </button>
          )}
        </div>
      </div>
      {(autosave.error || mutationError) && (
        <div role="alert" className="lb-error">
          {autosave.error || mutationError}
        </div>
      )}
      <div className="lb-mobile-toolbar">
        <button
          type="button"
          aria-controls="landing-sections"
          aria-expanded={leftOpen}
          onClick={() => {
            setLeftOpen(!leftOpen);
            setRightOpen(false);
          }}
        >
          Sections & templates
        </button>
        <button
          type="button"
          aria-controls="landing-inspector"
          aria-expanded={rightOpen}
          onClick={() => {
            setRightOpen(!rightOpen);
            setLeftOpen(false);
          }}
        >
          Inspector
        </button>
      </div>
      {preview && (
        <div className="lb-preview-banner">
          <span>Interactive preview · Orders are disabled</span>
          <label>
            <input
              type="checkbox"
              checked={motionOff}
              onChange={(e) => setMotionOff(e.target.checked)}
            />
            Motion off
          </label>
          <label>
            Width{" "}
            <input
              type="number"
              min={320}
              max={1920}
              value={width}
              onChange={(e) => setWidth(Math.min(1920, Math.max(320, Number(e.target.value))))}
            />
          </label>
        </div>
      )}
      <div className="lb-body">
        {!preview && (
          <aside
            id="landing-sections"
            className={`lb-left ${leftOpen ? "lb-panel-open" : ""}`}
            aria-label="Sections and templates"
          >
            <div className="lb-tabs" role="tablist">
              {(["Sections", "Add", "Templates"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  role="tab"
                  aria-selected={leftTab === t}
                  onClick={() => {
                    setLeftTab(t);
                    setSearch("");
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            {leftTab !== "Sections" && (
              <input
                className="lb-panel-search"
                aria-label={`Search ${leftTab.toLowerCase()}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${leftTab.toLowerCase()}`}
              />
            )}
            <fieldset disabled={busy || !canEdit} className="lb-tree-fieldset">
              {leftTab === "Sections" && (
                <>
                  <SectionTree
                    sections={draft.sections}
                    selectedSection={sectionId}
                    selectedBlock={blockId}
                    onSelect={select}
                    onSection={sectionAction}
                    onBlock={blockAction}
                    onDrag={drag}
                  />
                  <button
                    type="button"
                    className="lb-add-button"
                    disabled={draft.sections.length >= 20}
                    onClick={() => {
                      const s = createLandingSection();
                      const footerIndex = draft.sections.findIndex((s) =>
                        s.components.some((c) => c.type === "FOOTER"),
                      );
                      const sections = [...draft.sections];
                      sections.splice(footerIndex < 0 ? sections.length : footerIndex, 0, s);
                      commit({ ...draft, sections });
                      select(s.id);
                    }}
                  >
                    + Add section
                  </button>
                  <p className="lb-help">
                    {draft.sections.length}/20 sections · {count}/30 blocks
                  </p>
                </>
              )}
              {leftTab === "Add" &&
                (["Content", "Commerce", "Media", "Navigation"] as const).map((group) => (
                  <div key={group} className="lb-add-group">
                    <h3>{group}</h3>
                    {Object.entries(blockRegistry)
                      .filter(
                        ([type, entry]) =>
                          entry.group === group &&
                          (v2 ||
                            [
                              "HERO",
                              "TEXT",
                              "MENU",
                              "CATALOG",
                              "GALLERY",
                              "CONTACT",
                              "CTA",
                            ].includes(type)) &&
                          entry.label.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map(([type, entry]) => (
                        <button
                          type="button"
                          key={type}
                          disabled={count >= 30}
                          onClick={() => add(type as LandingPageComponentType)}
                        >
                          <Icon icon={entry.icon} />
                          {entry.label}
                          <span>+</span>
                        </button>
                      ))}
                  </div>
                ))}
            </fieldset>
            {leftTab === "Templates" && (
              <div className="lb-template-list">
                {templates.isError && (
                  <QueryError message={templates.error.message} retry={() => templates.refetch()} />
                )}{" "}
                {!v2 && (
                  <p className="lb-help">
                    Upgrade your design as a new variant. Your original remains available.
                  </p>
                )}
                {filteredTemplates.map((t) => (
                  <article key={t.id}>
                    <img src={t.preview} alt={`${t.name} design direction`} loading="lazy" />
                    <div>
                      <h3>{t.name}</h3>
                      <p>{t.description}</p>
                      <span>
                        {t.category} · {t.goal}
                      </span>
                      <Button
                        disabled={busy || !canCreate}
                        onClick={() => openDialog("template", t)}
                      >
                        View template
                      </Button>
                    </div>
                  </article>
                ))}
                {!templates.isLoading && !filteredTemplates.length && !templates.isError && (
                  <p className="lb-help">No templates match your search.</p>
                )}
              </div>
            )}
          </aside>
        )}
        <main className="lb-canvas-area">
          <div className="lb-canvas-label">
            <span>
              {width} px · {preview ? "Preview" : "Edit canvas"}
            </span>
            <span>
              {v2
                ? (templates.data?.templates.find((t) => t.id === draft.template?.id)?.name ??
                  "Custom design")
                : "Legacy design"}
            </span>
          </div>
          <div className="lb-canvas-scroll">
            <PreviewFrame
              width={width}
              payload={{
                draft,
                catalogItems: builder.data.catalogItems,
                menuItems: builder.data.menuItems,
                mode: preview ? "PREVIEW" : "EDIT",
                selectedId: blockId,
                motionOff,
              }}
              onSelect={(id, sid) => select(sid, id)}
            />
          </div>
        </main>
        {!preview && (
          <aside
            id="landing-inspector"
            className={`lb-inspector ${rightOpen ? "lb-panel-open" : ""}`}
            aria-label="Inspector"
          >
            <div className="lb-inspector-nav">
              {(["Selection", "Theme", "Commerce"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  aria-pressed={inspector === t}
                  onClick={() => setInspector(t)}
                >
                  {t}
                </button>
              ))}
              <button
                type="button"
                className="lb-close-panel"
                aria-label="Close inspector"
                onClick={() => setRightOpen(false)}
              >
                ×
              </button>
            </div>
            <fieldset disabled={busy || !canEdit} className="lb-inspector-fields">
              {inspector === "Selection" &&
                (block ? (
                  <BlockInspector
                    key={block.id}
                    block={block}
                    draft={draft}
                    catalog={builder.data.catalogItems}
                    onChange={updateBlock}
                  />
                ) : section ? (
                  <>
                    <h2>Section</h2>
                    <InspectorField label="Section name">
                      <input
                        maxLength={80}
                        value={section.name}
                        onChange={(e) => updateSection({ ...section, name: e.target.value })}
                      />
                    </InspectorField>
                    {v2 && (
                      <InspectorField label="Anchor">
                        <input
                          value={section.anchor ?? section.id}
                          onChange={(e) => updateSection({ ...section, anchor: e.target.value })}
                        />
                      </InspectorField>
                    )}
                    <InspectorSelect
                      label="Content width"
                      value={section.contentWidth}
                      values={["FULL", "WIDE", "CONTAINED"]}
                      onChange={(v) =>
                        updateSection({
                          ...section,
                          contentWidth: v as LandingPageSection["contentWidth"],
                        })
                      }
                    />
                    <InspectorSelect
                      label="Spacing"
                      value={section.padding}
                      values={["NONE", "SMALL", "MEDIUM", "LARGE"]}
                      onChange={(v) =>
                        updateSection({ ...section, padding: v as LandingPageSection["padding"] })
                      }
                    />
                    <InspectorSelect
                      label="Gap"
                      value={section.gap}
                      values={["NONE", "SMALL", "MEDIUM", "LARGE"]}
                      onChange={(v) =>
                        updateSection({ ...section, gap: v as LandingPageSection["gap"] })
                      }
                    />
                    <ColorField
                      label="Section color"
                      value={section.backgroundColor}
                      onChange={(backgroundColor) => updateSection({ ...section, backgroundColor })}
                    />
                    <InspectorField label="Maximum section height (0 for automatic)">
                      <input
                        type="number"
                        min={0}
                        max={3000}
                        step={1}
                        value={section.maxHeight ?? 0}
                        onChange={(e) =>
                          updateSection({ ...section, maxHeight: Number(e.target.value) })
                        }
                      />
                    </InspectorField>
                    {v2 && (
                      <>
                        {(["padding", "gap"] as const).map((key) => (
                          <InspectorSelect
                            key={key}
                            label={`Mobile section ${key}`}
                            value={section.mobile?.[key] ?? section[key]}
                            values={["NONE", "SMALL", "MEDIUM", "LARGE"]}
                            onChange={(v) =>
                              updateSection({
                                ...section,
                                mobile: {
                                  padding: section.mobile?.padding ?? section.padding,
                                  gap: section.mobile?.gap ?? section.gap,
                                  [key]: v as "NONE" | "SMALL" | "MEDIUM" | "LARGE",
                                },
                              })
                            }
                          />
                        ))}
                      </>
                    )}
                    <ColorField
                      label="Section text"
                      value={section.textColor}
                      onChange={(textColor) => updateSection({ ...section, textColor })}
                    />
                    {v2 && (
                      <BackgroundInspector
                        value={section.background}
                        color={draft.theme.backgroundColor}
                        templateId={draft.template?.id}
                        onChange={(background) => updateSection({ ...section, background })}
                      />
                    )}
                  </>
                ) : (
                  <p className="lb-help">Select a section or a block in the canvas.</p>
                ))}
              {inspector === "Theme" && (
                <>
                  <h2>Design system</h2>
                  {v2 && (
                    <InspectorSelect
                      label="Body font"
                      value={draft.theme.bodyFont ?? "APP_SANS"}
                      values={["APP_SANS", "SYSTEM"]}
                      onChange={(v) =>
                        commit({
                          ...draft,
                          theme: { ...draft.theme, bodyFont: v as "APP_SANS" | "SYSTEM" },
                        })
                      }
                    />
                  )}
                  {(
                    [
                      "primaryColor",
                      "backgroundColor",
                      "surfaceColor",
                      "textColor",
                      ...(v2 ? ["accentColor", "mutedTextColor", "borderColor"] : []),
                    ] as Array<keyof LandingPageVariant["theme"]>
                  ).map((key) => (
                    <ColorField
                      key={key}
                      label={String(key).replace("Color", " color")}
                      value={String(draft.theme[key] ?? "")}
                      onChange={(value) =>
                        commit({ ...draft, theme: { ...draft.theme, [key]: value } })
                      }
                    />
                  ))}
                  <InspectorSelect
                    label="Button style"
                    value={draft.theme.buttonStyle}
                    values={["ROUNDED", "PILL", "SQUARE"]}
                    onChange={(value) =>
                      commit({
                        ...draft,
                        theme: {
                          ...draft.theme,
                          buttonStyle: value as LandingPageVariant["theme"]["buttonStyle"],
                        },
                      })
                    }
                  />
                  {v2 ? (
                    <>
                      <InspectorSelect
                        label="Display font"
                        value={draft.theme.displayFont}
                        values={[
                          "LEGACY",
                          "DISPLAY_CONDENSED",
                          "EDITORIAL_SERIF",
                          "MODERN_GROTESK",
                        ]}
                        onChange={(value) =>
                          commit({
                            ...draft,
                            theme: {
                              ...draft.theme,
                              displayFont: value as LandingPageVariant["theme"]["displayFont"],
                            },
                          })
                        }
                      />
                      <InspectorSelect
                        label="Content maximum width"
                        value={draft.theme.contentMaxWidth}
                        values={[1120, 1280, 1440]}
                        onChange={(value) =>
                          commit({
                            ...draft,
                            theme: {
                              ...draft.theme,
                              contentMaxWidth: Number(value) as 1120 | 1280 | 1440,
                            },
                          })
                        }
                      />
                      <InspectorSelect
                        label="Motion intensity"
                        value={draft.theme.motionLevel}
                        values={["OFF", "SUBTLE", "EXPRESSIVE"]}
                        onChange={(value) =>
                          commit({
                            ...draft,
                            theme: {
                              ...draft.theme,
                              motionLevel: value as "OFF" | "SUBTLE" | "EXPRESSIVE",
                            },
                          })
                        }
                      />
                      <BackgroundInspector
                        value={draft.theme.background}
                        inherit={false}
                        color={draft.theme.backgroundColor}
                        templateId={draft.template?.id}
                        onChange={(background) =>
                          commit({ ...draft, theme: { ...draft.theme, background } })
                        }
                      />
                    </>
                  ) : (
                    <InspectorSelect
                      label="Font style"
                      value={draft.theme.fontStyle}
                      values={["MODERN", "CLASSIC"]}
                      onChange={(value) =>
                        commit({
                          ...draft,
                          theme: { ...draft.theme, fontStyle: value as "MODERN" | "CLASSIC" },
                        })
                      }
                    />
                  )}
                </>
              )}
              {inspector === "Commerce" && (
                <>
                  <h2>Conversion & checkout</h2>
                  {v2 && (
                    <InspectorSelect
                      label="Conversion goal"
                      value={draft.goal}
                      values={["SHOP", "CATALOG", "INQUIRY"]}
                      onChange={(value) =>
                        commit({
                          ...draft,
                          goal: value as LandingGoal,
                          commerce: { ...draft.commerce, orderingEnabled: value === "SHOP" },
                        })
                      }
                    />
                  )}
                  <p className="lb-help">
                    Shop enables ordering. Catalog and inquiry show product details and real contact
                    links.
                  </p>
                  <label className="lb-checkbox">
                    <input
                      type="checkbox"
                      disabled={v2 && draft.goal !== "SHOP"}
                      checked={draft.commerce.orderingEnabled}
                      onChange={(e) =>
                        commit({
                          ...draft,
                          commerce: { ...draft.commerce, orderingEnabled: e.target.checked },
                        })
                      }
                    />
                    Enable ordering
                  </label>
                  <InspectorField label="Cart button label">
                    <input
                      maxLength={30}
                      value={draft.commerce.cartButtonLabel}
                      onChange={(e) =>
                        commit({
                          ...draft,
                          commerce: { ...draft.commerce, cartButtonLabel: e.target.value },
                        })
                      }
                    />
                  </InspectorField>
                  <InspectorSelect
                    label="Cart button position"
                    value={draft.commerce.cartButtonPosition}
                    values={["BOTTOM_LEFT", "BOTTOM_RIGHT"]}
                    onChange={(v) =>
                      commit({
                        ...draft,
                        commerce: {
                          ...draft.commerce,
                          cartButtonPosition: v as "BOTTOM_LEFT" | "BOTTOM_RIGHT",
                        },
                      })
                    }
                  />
                  {(["PICKUP", "DELIVERY"] as const).map((method) => (
                    <label key={method} className="lb-checkbox">
                      <input
                        type="checkbox"
                        checked={draft.commerce.fulfillmentMethods.includes(method)}
                        onChange={(e) => {
                          const payment =
                            method === "PICKUP" ? "PAY_ON_PICKUP" : "CASH_ON_DELIVERY";
                          commit({
                            ...draft,
                            commerce: {
                              ...draft.commerce,
                              fulfillmentMethods: e.target.checked
                                ? [...draft.commerce.fulfillmentMethods, method]
                                : draft.commerce.fulfillmentMethods.filter((m) => m !== method),
                              paymentMethods: e.target.checked
                                ? [...draft.commerce.paymentMethods, payment]
                                : draft.commerce.paymentMethods.filter((m) => m !== payment),
                            },
                          });
                        }}
                      />
                      {method === "PICKUP"
                        ? "Pickup · Pay on pickup"
                        : "Delivery · Cash on delivery"}
                    </label>
                  ))}
                  {(["minimumOrder", "deliveryFee"] as const).map((key) => (
                    <InspectorField
                      key={key}
                      label={key === "minimumOrder" ? "Minimum order" : "Delivery fee"}
                    >
                      <input
                        type="number"
                        min={0}
                        max={1000000}
                        step={0.01}
                        value={draft.commerce[key]}
                        onChange={(e) =>
                          commit({
                            ...draft,
                            commerce: { ...draft.commerce, [key]: Number(e.target.value) },
                          })
                        }
                      />
                    </InspectorField>
                  ))}
                  <InspectorField label="Checkout instructions">
                    <textarea
                      maxLength={500}
                      value={draft.commerce.checkoutInstructions}
                      onChange={(e) =>
                        commit({
                          ...draft,
                          commerce: { ...draft.commerce, checkoutInstructions: e.target.value },
                        })
                      }
                    />
                  </InspectorField>
                  {v2 && (
                    <InspectorField label="Inline merchant contact">
                      <select
                        value={draft.commerce.contactBlockId ?? ""}
                        onChange={(e) =>
                          commit({
                            ...draft,
                            commerce: {
                              ...draft.commerce,
                              contactBlockId: e.target.value || undefined,
                            },
                          })
                        }
                      >
                        <option value="">Separate contact section</option>
                        {draft.sections
                          .filter((s) => s.enabled)
                          .flatMap((s) =>
                            s.components.filter((c) => c.enabled && c.type === "CONTACT"),
                          )
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.type === "CONTACT" ? c.content.heading : c.id}
                            </option>
                          ))}
                      </select>
                    </InspectorField>
                  )}
                </>
              )}
            </fieldset>
          </aside>
        )}
      </div>
      <Dialog
        open={Boolean(dialog)}
        onOpenChange={(open) => !busy && !open && setDialog(undefined)}
      >
        <DialogContent className={dialog?.kind === "template" ? "max-w-3xl" : ""}>
          <DialogTitle>
            {dialog?.kind === "template"
              ? dialog.template?.name
              : dialog?.kind === "reset"
                ? `Reset ${draft.name}?`
                : dialog?.kind === "delete"
                  ? `Delete ${draft.name}?`
                  : dialog?.kind === "settings"
                    ? "Site settings"
                    : `${dialog?.kind === "rename" ? "Rename" : dialog?.kind === "duplicate" ? "Duplicate" : "New"} variant`}
          </DialogTitle>
          <DialogDescription>
            {dialog?.kind === "reset"
              ? `Restore ${templates.data?.templates.find((t) => t.id === draft.template?.id)?.name ?? "the default template"}${draft.template ? " revision " + draft.template.revision : ""}. Recent changes will be lost, including changes already saved automatically. Your published page stays the same until you publish again.`
              : dialog?.kind === "delete"
                ? "This removes this draft variant."
                : dialog?.kind === "template"
                  ? "Apply as a new editable draft. Your existing variant and published page remain available."
                  : "Changes to a draft become public only when you publish."}
          </DialogDescription>
          <form onSubmit={submitDialog} className="lb-dialog-form">
            {dialog?.kind === "new" && dialog.template && (
              <>
                <InspectorField label="Starting template">
                  <select
                    value={dialog.template.id}
                    onChange={(e) => {
                      const template = templates.data?.templates.find(
                        (t) => t.id === e.target.value,
                      );
                      if (template) {
                        setDialog({ ...dialog, template });
                        setGoal(template.goal);
                      }
                    }}
                  >
                    {templates.data?.templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </InspectorField>
                <InspectorSelect
                  label="Goal"
                  value={goal}
                  values={["SHOP", "CATALOG", "INQUIRY"]}
                  onChange={(v) => setGoal(v as LandingGoal)}
                />
              </>
            )}
            {dialog?.kind === "template" && dialog.template && (
              <>
                <div className="lb-template-detail-images">
                  <img src={dialog.template.preview} alt="Desktop design direction" />
                  <img src={dialog.template.mobilePreview} alt="Mobile background composition" />
                  {dialog.template.orderingPreview && (
                    <img src={dialog.template.orderingPreview} alt="Companion ordering direction" />
                  )}
                </div>
                <p>{dialog.template.description}</p>
                <p>Includes: {dialog.template.sections.join(" · ")}</p>
                <InspectorSelect
                  label="Goal"
                  value={goal}
                  values={["SHOP", "CATALOG", "INQUIRY"]}
                  onChange={(v) => setGoal(v as LandingGoal)}
                />
              </>
            )}
            {dialog?.kind === "settings" ? (
              <>
                <InspectorField label="Site title">
                  <input name="siteTitle" defaultValue={page.siteTitle} maxLength={120} required />
                </InspectorField>
                <InspectorField label="Public page address">
                  <input
                    name="slug"
                    defaultValue={page.slug}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    minLength={3}
                    maxLength={60}
                    required
                  />
                </InspectorField>
                <InspectorField label="Search description">
                  <textarea
                    name="seoDescription"
                    defaultValue={page.seoDescription}
                    maxLength={240}
                  />
                </InspectorField>
              </>
            ) : (
              !["reset", "delete"].includes(dialog?.kind ?? "") && (
                <InspectorField label="Variant name">
                  <input
                    value={name}
                    maxLength={80}
                    required
                    onChange={(e) => setName(e.target.value)}
                  />
                </InspectorField>
              )
            )}
            {mutationError && <p role="alert">{mutationError}</p>}
            <div className="lb-dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialog(undefined)}
              >
                Cancel
              </Button>
              <Button
                disabled={busy}
                variant={
                  dialog?.kind === "reset" || dialog?.kind === "delete" ? "destructive" : "default"
                }
              >
                {busy
                  ? "Working…"
                  : dialog?.kind === "reset"
                    ? "Reset variant"
                    : dialog?.kind === "delete"
                      ? "Delete variant"
                      : dialog?.kind === "template"
                        ? "Apply as new variant"
                        : "Confirm"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
