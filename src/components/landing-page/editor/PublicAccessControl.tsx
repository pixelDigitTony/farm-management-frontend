import { useRef, useState } from "react";
import { ApiError, api } from "@/api/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { LandingPageRecord } from "@/types/landing-page";

function localValue(instant: string | null | undefined, timezone: string) {
  return instant
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .format(new Date(instant))
        .replace(" ", "T")
    : "";
}
export function PublicAccessControl({
  page,
  canEdit,
  refresh,
}: {
  page: LandingPageRecord;
  canEdit: boolean;
  refresh: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("IMMEDIATE");
  const [timezone, setTimezone] = useState(
    page.publicAccess?.timezone ?? page.timezone ?? "Asia/Manila",
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const key = useRef(crypto.randomUUID());
  const switchElement = useRef<HTMLInputElement>(null);
  const lastPayload = useRef("");
  const active = page.isAccessible ?? page.isPublished;
  function show() {
    const tz = page.publicAccess?.timezone ?? page.timezone ?? "Asia/Manila";
    setTimezone(tz);
    setMode(
      page.publicAccess?.mode && page.publicAccess.mode !== "INACTIVE"
        ? page.publicAccess.mode
        : "IMMEDIATE",
    );
    setStart(localValue(page.publicAccess?.startsAt, tz));
    setEnd(localValue(page.publicAccess?.endsAt, tz));
    setStartNow(
      !page.publicAccess?.startsAt || Date.parse(page.publicAccess.startsAt) <= Date.now(),
    );
    setError("");
    setOpen(true);
    lastPayload.current = "";
  }
  async function save(nextMode: string) {
    if (busy) return;
    const payload = {
      mode: nextMode,
      timezone,
      expectedPageRevision: page.revision ?? 1,
      ...(["SCHEDULED", "LIMITED"].includes(nextMode)
        ? nextMode === "LIMITED" && startNow
          ? { startNow: true }
          : { startLocal: start }
        : {}),
      ...(nextMode === "LIMITED" ? { endLocal: end } : {}),
    };
    const serialized = JSON.stringify(payload);
    if (lastPayload.current !== serialized) {
      key.current = crypto.randomUUID();
      lastPayload.current = serialized;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<LandingPageRecord>(`/landing-page/pages/${page._id}/access`, {
        method: "PATCH",
        headers: { "Idempotency-Key": key.current },
        body: serialized,
      });
      await refresh();
      setOpen(false);
      setAnnouncement(`Public access: ${result.accessStatus}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change public access");
      if (cause instanceof ApiError && cause.status === 409) {
        await refresh();
        lastPayload.current = "";
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="lb-access-control">
      <span>{page.accessStatus ?? (active ? "Active" : "Inactive")}</span>
      <label className="lb-access-switch">
        <span>Public access</span>
        <input
          ref={switchElement}
          type="checkbox"
          role="switch"
          aria-checked={active}
          checked={active}
          disabled={busy || !canEdit || !page.isPublished}
          onChange={() => (active ? void save("INACTIVE") : show())}
        />
      </label>
      {!page.isPublished && <small>Publish this page before activating its link.</small>}
      {page.publicAccess && ["SCHEDULED", "LIMITED"].includes(page.publicAccess.mode) && (
        <>
          <button type="button" disabled={!canEdit || busy} onClick={show}>
            Manage schedule
          </button>
          <button type="button" disabled={!canEdit || busy} onClick={() => void save("INACTIVE")}>
            Cancel schedule
          </button>
        </>
      )}
      {error && !open && <p role="alert">{error}</p>}
      <span className="sr-only" role="status">
        {announcement}
      </span>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className="lb-access-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            switchElement.current?.focus({ preventScroll: true });
          }}
        >
          <DialogTitle>Make landing page active</DialogTitle>
          <DialogDescription>
            {page.name ?? page.siteTitle} · {page.slug}
            <br />
            Visitors will see the latest published version. Unpublished draft changes will not
            appear.
          </DialogDescription>
          <form
            className="lb-access-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save(mode);
            }}
          >
            <label>
              Activation
              <select
                value={mode}
                disabled={busy}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="IMMEDIATE">Live immediately</option>
                <option value="SCHEDULED">Schedule live</option>
                <option value="LIMITED">Limited live</option>
              </select>
            </label>
            <label>
              Timezone
              <input
                required
                value={timezone}
                disabled={busy}
                onChange={(event) => setTimezone(event.target.value)}
                list="landing-timezones"
              />
              <datalist id="landing-timezones">
                <option>Asia/Manila</option>
                <option>UTC</option>
              </datalist>
            </label>
            {mode === "LIMITED" && (
              <label>
                <input
                  type="checkbox"
                  checked={startNow}
                  onChange={(event) => setStartNow(event.target.checked)}
                />{" "}
                Start now
              </label>
            )}
            {(mode === "SCHEDULED" || (mode === "LIMITED" && !startNow)) && (
              <label>
                Start date and time
                <input
                  required
                  type="datetime-local"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
            )}
            {mode === "LIMITED" && (
              <label>
                End date and time
                <input
                  required
                  type="datetime-local"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
            )}
            <p>
              {mode === "IMMEDIATE"
                ? "Active immediately, with no automatic end."
                : `Active ${mode === "LIMITED" && startNow ? "from confirmation" : `from ${start || "the chosen start"}`} ${mode === "LIMITED" ? `until ${end || "the chosen end"}` : "with no automatic end"}, in ${timezone}.`}
            </p>
            {active && (mode === "SCHEDULED" || (mode === "LIMITED" && !startNow)) && (
              <p>Replacing the current window with a future start closes access immediately.</p>
            )}
            {error && <p role="alert">{error}</p>}
            <button type="button" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button disabled={busy} type="submit">
              {busy
                ? "Saving…"
                : mode === "SCHEDULED"
                  ? "Schedule activation"
                  : mode === "LIMITED"
                    ? "Confirm live window"
                    : "Make active"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
