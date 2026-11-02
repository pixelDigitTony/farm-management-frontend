import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/api/client";
import { MyDayStory } from "@/components/landing-page/MyDayDialog";
import { StoredImage } from "@/components/StoredImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  localInstants,
  type MyDayCampaign,
  type MyDayList,
  type MyDayPreview,
  zonedInput,
} from "@/lib/my-day";
import { validTimezone } from "@/lib/product-availability";
import type { CatalogProduct } from "@/types/domain";

type Draft = {
  id?: string;
  revision?: number;
  name: string;
  heading: string;
  description: string;
  landingPageId: string;
  productIds: string[];
  timezone: string;
  startNow: boolean;
  start: string;
  end: string;
  startChoice: string;
  endChoice: string;
  isEnabled: boolean;
};
const fromCampaign = (c: MyDayCampaign): Draft => ({
  id: c._id,
  revision: c.revision,
  name: c.name,
  heading: c.heading,
  description: c.description,
  landingPageId: c.landingPageId,
  productIds: c.productIds,
  timezone: c.timezone,
  startNow: false,
  start: zonedInput(c.startsAt, c.timezone),
  end: zonedInput(c.endsAt, c.timezone),
  startChoice: new Date(c.startsAt).toISOString(),
  endChoice: new Date(c.endsAt).toISOString(),
  isEnabled: c.isEnabled,
});
const fieldClass = "h-11 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 text-sm";

export function CatalogMyDayManager({
  products,
  timezone,
  shortcut,
  onShortcutHandled,
}: {
  products: CatalogProduct[];
  timezone: string;
  shortcut?: string;
  onShortcutHandled: () => void;
}) {
  const [open, setOpen] = useState(false),
    [offset, setOffset] = useState(0);
  const [draft, setDraft] = useState<Draft>(),
    [search, setSearch] = useState("");
  const [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const [deleting, setDeleting] = useState<string>(),
    [preview, setPreview] = useState<MyDayPreview>();
  const [previewAt, setPreviewAt] = useState(""),
    [previewChoice, setPreviewChoice] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ["catalog-my-day", offset],
    queryFn: () => api<MyDayList>(`/catalog/my-day?offset=${offset}&limit=20`),
    enabled: open,
    refetchInterval: open && !draft ? 30_000 : false,
  });
  const now = useCallback(
    () => Date.parse(list.data?.serverTime ?? new Date().toISOString()),
    [list.data?.serverTime],
  );
  const create = useCallback(
    (productId?: string) => {
      setDraft({
        name: "",
        heading: "My Day",
        description: "",
        landingPageId: list.data?.pages[0]?._id ?? "",
        productIds: productId ? [productId] : [],
        timezone,
        startNow: true,
        start: zonedInput(now(), timezone),
        end: zonedInput(now() + 86400_000, timezone),
        startChoice: "",
        endChoice: "",
        isEnabled: false,
      });
      setError("");
      setConflict(false);
      setPreview(undefined);
      setSearch("");
      setPreviewAt("");
      setPreviewChoice("");
    },
    [list.data?.pages, timezone, now],
  );
  useEffect(() => {
    if (shortcut) {
      setOpen(true);
      create(shortcut);
      onShortcutHandled();
    }
  }, [shortcut, create, onShortcutHandled]);
  useEffect(() => {
    const pageId = list.data?.pages[0]?._id;
    if (pageId)
      setDraft((current) =>
        current && !current.landingPageId ? { ...current, landingPageId: pageId } : current,
      );
  }, [list.data?.pages]);
  function payload(isEnabled = draft?.isEnabled ?? false) {
    if (!draft || !form.current?.reportValidity()) throw new Error("Complete the required fields.");
    if (!validTimezone(draft.timezone)) throw new Error("Choose a valid IANA timezone.");
    const choose = (local: string, choice: string) => {
      const candidates = localInstants(local, draft.timezone);
      if (!candidates.length)
        throw new Error("A date/time is invalid or does not exist in this timezone.");
      // Preserve saved seconds/milliseconds until the owner edits this field.
      if (choice && zonedInput(choice, draft.timezone) === local) return choice;
      if (candidates.length > 1 && !candidates.includes(choice))
        throw new Error("This time occurs twice. Choose the intended UTC instant.");
      return candidates.includes(choice) ? choice : (candidates[0] ?? "");
    };
    if (!draft.productIds.length || draft.productIds.length > 10)
      throw new Error("Select 1–10 products.");
    const startsAt = draft.startNow ? undefined : choose(draft.start, draft.startChoice);
    const endsAt = choose(draft.end, draft.endChoice);
    if (Date.parse(endsAt) <= (startsAt ? Date.parse(startsAt) : now()))
      throw new Error("End must be after start.");
    return {
      name: draft.name,
      heading: draft.heading,
      description: draft.description,
      landingPageId: draft.landingPageId,
      productIds: draft.productIds,
      timezone: draft.timezone,
      ...(draft.startNow ? { startNow: true } : { startsAt }),
      endsAt,
      isEnabled,
      ...(draft.revision ? { expectedRevision: draft.revision } : {}),
    };
  }
  const mutation = useMutation({
    mutationFn: async (operation: {
      method: "POST" | "PUT" | "PATCH" | "DELETE";
      path: string;
      body: unknown;
    }) => api(operation.path, { method: operation.method, body: JSON.stringify(operation.body) }),
    onSuccess: async () => {
      setDraft(undefined);
      setPreview(undefined);
      setError("");
      setDeleting(undefined);
      setConflict(false);
      await client.invalidateQueries({ queryKey: ["catalog-my-day"] });
      await client.invalidateQueries({ queryKey: ["public-landing-page"] });
    },
    onError: (err) => {
      setError(err.message);
      setConflict(err instanceof ApiError && err.code === "MY_DAY_REVISION_CONFLICT");
    },
  });
  const previewMutation = useMutation({
    mutationFn: async () => {
      const input = payload();
      let at: string | undefined;
      if (previewAt && draft) {
        const choices = localInstants(previewAt, draft.timezone);
        at = choices.length === 1 ? choices[0] : choices.find((c) => c === previewChoice);
        if (!at) throw new Error("Choose a valid preview time and resolve any repeated time.");
      }
      return api<MyDayPreview>("/catalog/my-day/preview", {
        method: "POST",
        body: JSON.stringify({ ...input, ...(at ? { at } : {}) }),
      });
    },
    onSuccess: (value) => {
      setError("");
      setPreview(value);
    },
    onError: (err) => setError(err.message),
  });
  const pending = mutation.isPending || previewMutation.isPending;
  function save(enabled: boolean) {
    try {
      mutation.mutate({
        method: draft?.id ? "PUT" : "POST",
        path: `/catalog/my-day${draft?.id ? `/${draft.id}` : ""}`,
        body: payload(enabled),
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }
  function datetime(
    label: string,
    value: string,
    choice: string,
    change: (value: string, choice: string) => void,
    required = true,
  ) {
    const inputId = `my-day-${label.replace(/[^a-z0-9]+/gi, "-")}`;
    let choices: string[] = [];
    try {
      choices = localInstants(value, draft?.timezone ?? timezone);
    } catch {
      /* Timezone field shows its own validation. */
    }
    return (
      <label htmlFor={inputId} className="grid min-w-0 gap-2 text-sm">
        {label} ({draft?.timezone ?? timezone})
        <Input
          id={inputId}
          type="datetime-local"
          required={required}
          value={value}
          onChange={(e) => change(e.target.value, "")}
        />
        {choices.length > 1 && (
          <select
            aria-label={`${label} repeated time`}
            className={fieldClass}
            required
            value={
              choices.find(
                (candidate) =>
                  Math.floor(Date.parse(candidate) / 60_000) ===
                  Math.floor(Date.parse(choice) / 60_000),
              ) ?? ""
            }
            onChange={(e) => change(value, e.target.value)}
          >
            <option value="">Choose intended instant (time occurs twice)</option>
            {choices.map((c) => (
              <option key={c} value={c}>
                {c} UTC
              </option>
            ))}
          </select>
        )}
      </label>
    );
  }
  return (
    <>
      <Button
        variant="outline"
        permission={{ path: "/catalog/my-day" }}
        onClick={() => setOpen(true)}
      >
        My Day
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) {
            setOpen(value);
            setDraft(undefined);
            setPreview(undefined);
            setError("");
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogTitle>
            {preview
              ? "My Day preview"
              : draft
                ? draft.id
                  ? "Edit My Day"
                  : "Schedule My Day"
                : "My Day campaigns"}
          </DialogTitle>
          <DialogDescription>
            Schedule product stories on a published landing page. Changes go live without
            republishing.
          </DialogDescription>
          {error && (
            <p role="alert" className="my-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {conflict && (
            <Button
              variant="outline"
              onClick={async () => {
                const refreshed = await list.refetch();
                const latest = refreshed.data?.items.find((c) => c._id === draft?.id);
                if (latest) setDraft(fromCampaign(latest));
                else setDraft(undefined);
                setConflict(false);
                setError("");
              }}
            >
              Reload latest campaigns
            </Button>
          )}
          {preview ? (
            <div className="mt-4 space-y-4">
              <p>
                Preview at{" "}
                {new Date(preview.at).toLocaleString("en-PH", { timeZone: draft?.timezone })}.
                Prices and stock are current.
              </p>
              {preview.myDay && preview.theme ? (
                <MyDayStory
                  campaign={preview.myDay}
                  items={preview.catalogItems}
                  theme={preview.theme}
                />
              ) : (
                <p>
                  No eligible products at this time. Publish the page and check its catalog
                  selection and schedule.
                </p>
              )}
              {preview.excluded.map((item) => (
                <p key={item.productId} className="text-sm">
                  {products.find((p) => p._id === item.productId)?.name ?? item.productId}:{" "}
                  {item.reason}
                </p>
              ))}
              <Button variant="outline" onClick={() => setPreview(undefined)}>
                Back to campaign
              </Button>
            </div>
          ) : draft ? (
            <form
              ref={form}
              className="mt-4 grid min-w-0 gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                save(draft.isEnabled);
              }}
            >
              <fieldset disabled={pending} className="grid min-w-0 gap-4">
                <label htmlFor="my-day-name" className="grid gap-2 text-sm">
                  Campaign name
                  <Input
                    id="my-day-name"
                    required
                    maxLength={120}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Landing page
                  <select
                    className={fieldClass}
                    required
                    value={draft.landingPageId}
                    onChange={(e) => setDraft({ ...draft, landingPageId: e.target.value })}
                  >
                    <option value="">Choose a page</option>
                    {list.data?.pages.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} /{p.slug} {p.isPublished ? "" : "(unpublished)"}
                      </option>
                    ))}
                  </select>
                </label>
                {!list.data?.pages.length && (
                  <p>Create a landing page in Landing Management first.</p>
                )}
                <label htmlFor="my-day-heading" className="grid gap-2 text-sm">
                  Public heading
                  <Input
                    id="my-day-heading"
                    required
                    maxLength={80}
                    value={draft.heading}
                    onChange={(e) => setDraft({ ...draft, heading: e.target.value })}
                  />
                </label>
                <label htmlFor="my-day-introduction" className="grid gap-2 text-sm">
                  Introduction
                  <Input
                    id="my-day-introduction"
                    maxLength={240}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </label>
                <div className="space-y-3">
                  <p className="text-sm">
                    Select 1–10 products. This does not change their Featured setting. Only products
                    allowed by the published catalog and current availability appear.
                  </p>
                  <Input
                    type="search"
                    aria-label="Search My Day products"
                    placeholder="Search products or categories"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="max-h-52 overflow-auto rounded-xl border p-2">
                    {products
                      .filter((p) =>
                        `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <label key={p._id} className="flex min-h-12 items-center gap-3 py-2">
                          <input
                            type="checkbox"
                            checked={draft.productIds.includes(p._id)}
                            disabled={
                              draft.productIds.length >= 10 && !draft.productIds.includes(p._id)
                            }
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                productIds: e.target.checked
                                  ? [...draft.productIds, p._id]
                                  : draft.productIds.filter((id) => id !== p._id),
                              })
                            }
                          />
                          <StoredImage
                            src={p.mediaUrls[0]}
                            alt=""
                            className="size-10 rounded object-cover"
                          />
                          <span className="min-w-0 break-words text-sm">
                            {p.name} · {p.category || "Uncategorized"}
                            {p.isFeatured ? " · Featured" : ""} ·{" "}
                            {p.availabilityStatus ?? (p.isActive ? "Active" : "Inactive")}
                          </span>
                        </label>
                      ))}
                  </div>
                  <ol className="space-y-2">
                    {draft.productIds.map((id, index) => (
                      <li key={id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 break-words">
                          {index + 1}.{" "}
                          {products.find((p) => p._id === id)?.name ?? "Missing product"}
                        </span>
                        {[-1, 1].map((delta) => (
                          <Button
                            key={delta}
                            type="button"
                            variant="outline"
                            className="h-11"
                            aria-label={`Move product ${index + 1} ${delta < 0 ? "up" : "down"}`}
                            disabled={index + delta < 0 || index + delta >= draft.productIds.length}
                            onClick={() => {
                              const ids = [...draft.productIds];
                              const neighbor = ids[index + delta];
                              if (!neighbor) return;
                              [ids[index], ids[index + delta]] = [neighbor, id];
                              setDraft({ ...draft, productIds: ids });
                            }}
                          >
                            {delta < 0 ? "↑" : "↓"}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              productIds: draft.productIds.filter((p) => p !== id),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ol>
                </div>
                <label htmlFor="my-day-timezone" className="grid gap-2 text-sm">
                  IANA timezone
                  <Input
                    id="my-day-timezone"
                    required
                    value={draft.timezone}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        timezone: e.target.value,
                        startChoice: "",
                        endChoice: "",
                      })
                    }
                  />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.startNow}
                    onChange={(e) => setDraft({ ...draft, startNow: e.target.checked })}
                  />
                  Start now when saved
                </label>
                {!draft.startNow &&
                  datetime("Start", draft.start, draft.startChoice, (start, startChoice) =>
                    setDraft({ ...draft, start, startChoice }),
                  )}
                {datetime("End", draft.end, draft.endChoice, (end, endChoice) =>
                  setDraft({ ...draft, end, endChoice }),
                )}
                <p className="rounded-xl bg-stone-50 p-3 text-sm">
                  Shows on{" "}
                  {list.data?.pages.find((p) => p._id === draft.landingPageId)?.name ??
                    "the selected page"}{" "}
                  from {draft.startNow ? "now" : draft.start.replace("T", " ")} to{" "}
                  {draft.end.replace("T", " ")} ({draft.timezone}). Visitors see it automatically at
                  most once a day.
                </p>
                {datetime(
                  "Preview time (optional)",
                  previewAt,
                  previewChoice,
                  (value, choice) => {
                    setPreviewAt(value);
                    setPreviewChoice(choice);
                  },
                  false,
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    permission={{ path: "/catalog/my-day", method: draft.id ? "PUT" : "POST" }}
                  >
                    {draft.isEnabled ? "Save enabled campaign" : "Save disabled"}
                  </Button>
                  <Button
                    type="button"
                    permission={{ path: "/catalog/my-day", method: draft.id ? "PUT" : "POST" }}
                    onClick={() => save(true)}
                  >
                    Save and enable
                  </Button>
                  <Button type="button" variant="outline" onClick={() => previewMutation.mutate()}>
                    Preview
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDraft(undefined);
                      setError("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </fieldset>
            </form>
          ) : (
            <div className="mt-4 space-y-4">
              <Button
                disabled={pending}
                permission={{ path: "/catalog/my-day", method: "POST" }}
                onClick={() => create()}
              >
                New campaign
              </Button>
              {list.isPending && <p role="status">Loading campaigns…</p>}
              {list.isError && (
                <p role="alert">
                  {list.error.message}{" "}
                  <Button variant="outline" onClick={() => void list.refetch()}>
                    Retry
                  </Button>
                </p>
              )}
              {list.data?.items.length === 0 && <p>No My Day campaigns yet.</p>}
              {list.data?.items.map((c) => (
                <article key={c._id} className="space-y-2 rounded-xl border p-4">
                  <h3 className="break-words font-semibold">
                    {c.name} · {c.status}
                  </h3>
                  <p className="text-sm">
                    {c.pageName} · {c.productIds.length} products
                  </p>
                  <p className="text-sm">
                    {new Date(c.startsAt).toLocaleString("en-PH", { timeZone: c.timezone })} –{" "}
                    {new Date(c.endsAt).toLocaleString("en-PH", { timeZone: c.timezone })} (
                    {c.timezone})
                  </p>
                  {c.diagnostics.map((d) => (
                    <p key={d} className="text-sm text-amber-800">
                      {d}
                    </p>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setDraft(fromCampaign(c));
                        setError("");
                        setPreviewAt("");
                      }}
                    >
                      Edit / Preview
                    </Button>
                    <Button
                      variant="outline"
                      disabled={pending}
                      permission={{ path: `/catalog/my-day/${c._id}/status`, method: "PATCH" }}
                      onClick={() =>
                        mutation.mutate({
                          method: "PATCH",
                          path: `/catalog/my-day/${c._id}/status`,
                          body: { isEnabled: !c.isEnabled, expectedRevision: c.revision },
                        })
                      }
                    >
                      {c.isEnabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      permission={{ path: `/catalog/my-day/${c._id}`, method: "DELETE" }}
                      onClick={() => setDeleting(c._id)}
                    >
                      Delete
                    </Button>
                  </div>
                  {deleting === c._id && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p>Delete this campaign permanently?</p>
                      <Button
                        variant="destructive"
                        disabled={pending}
                        onClick={() =>
                          mutation.mutate({
                            method: "DELETE",
                            path: `/catalog/my-day/${c._id}`,
                            body: { expectedRevision: c.revision },
                          })
                        }
                      >
                        Confirm delete
                      </Button>
                      <Button variant="ghost" onClick={() => setDeleting(undefined)}>
                        Keep campaign
                      </Button>
                    </div>
                  )}
                </article>
              ))}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  disabled={offset === 0 || list.isFetching}
                  onClick={() => setOffset(Math.max(0, offset - 20))}
                >
                  Previous
                </Button>
                <span>Page {offset / 20 + 1}</span>
                <Button
                  variant="outline"
                  disabled={offset + 20 >= (list.data?.total ?? 0) || list.isFetching}
                  onClick={() => setOffset(offset + 20)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
