import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getPublicSiteUrl } from "@/lib/public-site";
import type {
  LandingPageRecord,
  LandingPageVariant,
  LandingPageVariantPayload,
} from "@/types/landing-page";
import { normalizeLandingPageVariant } from "@/types/landing-page";
import { SubdomainField } from "./SubdomainField";

type SavedTemplate = { _id: string; name: string; revision: number; updatedAt: string };
export function LandingWorkspaceControls({
  page,
  draft,
  busy,
  canCreate,
  canEdit,
  canDelete,
  run,
  onSwitchPage,
  latestDraft,
  onSelectDraft,
  onTemplateLinked,
  refresh,
}: {
  page?: LandingPageRecord;
  draft?: LandingPageVariant;
  busy: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  run: (task: () => Promise<void>, discard?: boolean) => Promise<void>;
  onSwitchPage: (id: string) => void;
  latestDraft: () => LandingPageVariant | undefined;
  onSelectDraft: (draft: LandingPageVariant) => void;
  onTemplateLinked: (id: string, revision: number) => void;
  refresh: () => Promise<void>;
}) {
  const client = useQueryClient();
  const pages = useQuery({
    queryKey: ["landing-pages"],
    queryFn: () => api<{ items: LandingPageRecord[] }>("/landing-page/pages"),
  });
  const saved = useQuery({
    queryKey: ["landing-saved-templates"],
    queryFn: () => api<{ items: SavedTemplate[] }>("/landing-page/saved-templates"),
  });
  const [dialog, setDialog] = useState<"create" | "clone" | "save" | "library" | "archive">();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [available, setAvailable] = useState(false);
  const [destination, setDestination] = useState("");
  const [startingTemplate, setStartingTemplate] = useState("farm-and-market");
  const [error, setError] = useState("");
  const operationKey = useRef(crypto.randomUUID());
  const submission = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const open = (kind: NonNullable<typeof dialog>) => {
    operationKey.current = crypto.randomUUID();
    setError("");
    setName(kind === "clone" ? `${page?.name ?? page?.siteTitle ?? "Page"} copy` : "");
    setSlug("");
    setAvailable(false);
    setDestination(kind === "save" ? (draft?.sourceSavedTemplateId ?? "") : "");
    setDialog(kind);
  };
  async function execute(task: () => Promise<void>) {
    if (submission.current) return;
    submission.current = true;
    setSubmitting(true);
    setError("");
    await run(async () => {
      try {
        await task();
        setDialog(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "This action failed");
        throw cause;
      }
    });
    submission.current = false;
    setSubmitting(false);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await execute(async () => {
      const current = latestDraft();
      if (dialog === "create" || dialog === "clone") {
        const source =
          dialog === "clone" && current
            ? { sourceVariantId: current._id, expectedVariantRevision: current.revision ?? 1 }
            : startingTemplate.startsWith("saved:")
              ? { savedTemplateId: startingTemplate.slice(6) }
              : { templateId: startingTemplate };
        const result = await api<{ page: LandingPageRecord; variant: LandingPageVariant }>(
          "/landing-page/pages",
          {
            method: "POST",
            headers: { "Idempotency-Key": operationKey.current },
            body: JSON.stringify({ name, slug, ...source }),
          },
        );
        if (dialog === "clone")
          await api(`/landing-page/pages/${result.page._id}/publish`, {
            method: "POST",
            headers: { "Idempotency-Key": `${operationKey.current}_publish` },
            body: JSON.stringify({
              variantId: result.variant._id,
              expectedVariantRevision: result.variant.revision ?? 1,
              expectedPageRevision: result.page.revision ?? 1,
            }),
          });
        await client.invalidateQueries({ queryKey: ["landing-pages"] });
        onSwitchPage(result.page._id);
      } else if (dialog === "save") {
        if (!current) throw new Error("Open a draft first");
        const target = saved.data?.items.find((t) => t._id === destination);
        const template = await api<SavedTemplate>(
          destination
            ? `/landing-page/saved-templates/${destination}`
            : "/landing-page/saved-templates",
          {
            method: destination ? "PUT" : "POST",
            headers: { "Idempotency-Key": operationKey.current },
            body: JSON.stringify({
              sourceVariantId: current._id,
              expectedVariantRevision: current.revision ?? 1,
              ...(target ? { expectedTemplateRevision: target.revision } : { name }),
            }),
          },
        );
        onTemplateLinked(template._id, template.revision);
        await client.invalidateQueries({ queryKey: ["landing-saved-templates"] });
      } else if (dialog === "library") {
        if (!page) throw new Error("Open a landing page first");
        const selected = saved.data?.items.find((t) => t._id === destination);
        if (!selected) throw new Error("Choose a saved template");
        const created = await api<LandingPageVariantPayload>(
          `/landing-page/pages/${page._id}/variants`,
          { method: "POST", body: JSON.stringify({ name, savedTemplateId: selected._id }) },
        );
        onSelectDraft(normalizeLandingPageVariant(created));
        await refresh();
      } else if (dialog === "archive" && page) {
        await api(`/landing-page/pages/${page._id}`, {
          method: "DELETE",
          body: JSON.stringify({ expectedPageRevision: page.revision ?? 1 }),
        });
        const result = await pages.refetch();
        onSwitchPage(result.data?.items[0]?._id ?? "");
        await refresh();
      }
    });
  }
  const locked = busy || submitting;
  return (
    <div className="lb-workspace-controls">
      <fieldset className="lb-page-actions" aria-label="Page actions">
        <Button
          variant="outline"
          size="sm"
          disabled={locked || !canCreate}
          onClick={() => open("create")}
        >
          Create landing page
        </Button>
        {draft && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={locked || !canCreate}
              onClick={() => open("clone")}
            >
              Publish as another page
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={locked || !canEdit}
              onClick={() => open("save")}
            >
              Save template
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={locked || !canCreate}
              onClick={() => open("library")}
            >
              My templates
            </Button>
            {page && (
              <Button
                variant="outline"
                className="lb-danger-outline"
                size="sm"
                disabled={locked || !canDelete}
                onClick={() => open("archive")}
              >
                Delete page
              </Button>
            )}
          </>
        )}
      </fieldset>
      {page && (
        <span className="lb-page-address">
          {getPublicSiteUrl(page.slug)}
          {page.publishedAt ? ` · Published ${new Date(page.publishedAt).toLocaleString()}` : ""}
        </span>
      )}
      {pages.error && (
        <p role="alert">
          {pages.error.message}
          <Button variant="outline" size="sm" onClick={() => void pages.refetch()}>
            Retry pages
          </Button>
        </p>
      )}
      <Dialog
        open={Boolean(dialog)}
        onOpenChange={(value) => {
          if (!value && !locked) setDialog(undefined);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogTitle>
            {dialog === "save"
              ? destination
                ? `Update “${saved.data?.items.find((t) => t._id === destination)?.name ?? "saved template"}”?`
                : "Save as new template"
              : dialog === "library"
                ? "My templates"
                : dialog === "archive"
                  ? `Delete ${page?.name ?? page?.siteTitle}?`
                  : dialog === "clone"
                    ? "Publish as another page"
                    : "Create landing page"}
          </DialogTitle>
          <DialogDescription>
            {dialog === "save"
              ? "Replace a saved template with the current draft, or save a new one. Future uses get the updated design. Existing drafts and published pages keep their current content."
              : dialog === "archive"
                ? "This page will be unpublished and archived. Its address stays reserved, and existing order records remain available."
                : dialog === "clone"
                  ? "Copy and publish this saved draft as a separate page with its own address."
                  : dialog === "library"
                    ? "Use a private saved design as a new draft variant."
                    : "Choose a unique address and starting design for this page."}
          </DialogDescription>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <fieldset disabled={locked} className="space-y-4">
              {(dialog === "save" || dialog === "library") && (
                <label className="lb-field">
                  <span>{dialog === "save" ? "Save destination" : "Saved template"}</span>
                  <select
                    aria-label={dialog === "save" ? "Save destination" : "Saved template"}
                    value={destination}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      if (dialog === "library")
                        setName(
                          saved.data?.items.find((t) => t._id === e.target.value)?.name ?? "",
                        );
                      operationKey.current = crypto.randomUUID();
                    }}
                  >
                    <option value="">
                      {dialog === "save" ? "Save as new template" : "Choose a template"}
                    </option>
                    {saved.data?.items.map((item) => (
                      <option key={item._id} value={item._id}>
                        {item.name} · revision {item.revision}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {dialog === "save" && destination && (
                <p className="text-sm">
                  Last updated{" "}
                  {new Date(
                    saved.data?.items.find((t) => t._id === destination)?.updatedAt ?? "",
                  ).toLocaleString()}
                  . Confirm to replace this saved design.
                </p>
              )}
              {(dialog === "create" ||
                dialog === "clone" ||
                dialog === "library" ||
                (dialog === "save" && !destination)) && (
                <label className="lb-field">
                  <span>
                    {dialog === "library"
                      ? "Variant name"
                      : dialog === "save"
                        ? "Template name"
                        : "Page name"}
                  </span>
                  <input
                    required
                    value={name}
                    maxLength={dialog === "create" || dialog === "clone" ? 120 : 80}
                    onChange={(e) => {
                      setName(e.target.value);
                      operationKey.current = crypto.randomUUID();
                    }}
                  />
                </label>
              )}
              {(dialog === "create" || dialog === "clone") && (
                <SubdomainField
                  value={slug}
                  onChange={(value) => {
                    setSlug(value);
                    operationKey.current = crypto.randomUUID();
                  }}
                  onReady={setAvailable}
                />
              )}
              {dialog === "create" && (
                <label className="lb-field">
                  <span>Starting design</span>
                  <select
                    value={startingTemplate}
                    onChange={(e) => {
                      setStartingTemplate(e.target.value);
                      operationKey.current = crypto.randomUUID();
                    }}
                  >
                    {[
                      "farm-and-market",
                      "bold-market",
                      "everyday-boutique",
                      "editorial-studio",
                      "architectural-escape",
                    ].map((id) => (
                      <option key={id} value={id}>
                        {id.replaceAll("-", " ")}
                      </option>
                    ))}
                    {saved.data?.items.map((item) => (
                      <option key={item._id} value={`saved:${item._id}`}>
                        {item.name} (my template)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {saved.error && (dialog === "save" || dialog === "library") && (
                <p role="alert">
                  {saved.error.message}
                  <Button type="button" variant="outline" onClick={() => void saved.refetch()}>
                    Reload templates
                  </Button>
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      operationKey.current = crypto.randomUUID();
                      void saved.refetch();
                    }}
                  >
                    Reload template details
                  </Button>
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialog(undefined)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={dialog === "archive" ? "destructive" : "default"}
                  disabled={
                    locked ||
                    ((dialog === "create" || dialog === "clone") && !available) ||
                    (dialog === "library" && !destination) ||
                    (dialog === "save" && (saved.isLoading || saved.isError))
                  }
                >
                  {locked
                    ? "Working…"
                    : dialog === "save"
                      ? destination
                        ? "Update template"
                        : "Save new template"
                      : dialog === "library"
                        ? "Use template"
                        : dialog === "archive"
                          ? "Delete page"
                          : dialog === "clone"
                            ? "Create and publish"
                            : "Create page"}
                </Button>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
