import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as v from "valibot";
import { Button } from "@/components/ui/button";
import {
  type AvailabilitySchedule,
  alwaysAvailable,
  availabilityInfo,
  availabilityScheduleSchema,
  localDateAt,
  scheduleMatchesDate,
  scheduleSummary,
  shiftDate,
  validTimezone,
} from "@/lib/product-availability";

const modes = [
  {
    value: "WEEKDAYS",
    label: "Certain days in a week",
    emptyMessage: "Select at least one weekday.",
  },
  {
    value: "MONTH_WEEKS",
    label: "Certain weeks in a month",
    emptyMessage: "Select at least one week of the month.",
  },
  {
    value: "YEAR_MONTHS",
    label: "Certain months in a year",
    emptyMessage: "Select at least one month of the year.",
  },
  {
    value: "CUSTOM_DATES",
    label: "Custom calendar dates",
    emptyMessage: "Select at least one calendar date.",
  },
] as const;
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const timezones = [
  ...new Set([
    "Asia/Manila",
    "UTC",
    ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []),
  ]),
].sort();
const statusLabels: Record<string, string> = {
  INACTIVE: "Inactive",
  ALWAYS: "Always available",
  ACTIVE_NOW: "Active now",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
};

export function ProductAvailabilityEditor({
  schedule,
  isActive,
  onChange,
  onActiveChange,
  showValidationErrors = false,
  validationAttempt = 0,
  showHeading = true,
  now = Date.now(),
}: {
  schedule: AvailabilitySchedule;
  isActive: boolean;
  onChange: (rule: AvailabilitySchedule) => void;
  onActiveChange: (active: boolean) => void;
  showValidationErrors?: boolean;
  validationAttempt?: number;
  showHeading?: boolean;
  now?: number;
}) {
  const id = useId();
  const section = useRef<HTMLElement>(null);
  const remembered = useRef<Partial<Record<AvailabilitySchedule["mode"], AvailabilitySchedule>>>(
    {},
  );
  const lastMode = useRef(schedule.mode === "ALWAYS" ? "WEEKDAYS" : schedule.mode);
  const rememberedBounds = useRef<{ startsOn?: string; endsOn?: string }>({});
  const [changingTimezone, setChangingTimezone] = useState(false);
  const timezoneValid = validTimezone(schedule.timezone);
  const today = localDateAt(new Date(now), timezoneValid ? schedule.timezone : "Asia/Manila");
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = `${month}-01`;
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const parsed = useMemo(() => v.safeParse(availabilityScheduleSchema, schedule), [schedule]);
  const rule = parsed.success ? parsed.output : undefined;
  const minute = Math.floor(now / 60_000);
  const preview = useMemo(
    () =>
      rule
        ? availabilityInfo({ isActive, availabilitySchedule: rule }, new Date(minute * 60_000))
        : undefined,
    [rule, isActive, minute],
  );
  const validationMessage = parsed.success
    ? ""
    : ((parsed.issues[0]?.type === "min_length"
        ? modes.find((mode) => mode.value === schedule.mode)?.emptyMessage
        : parsed.issues[0]?.message) ?? "Complete the availability schedule.");
  const recurring = schedule.mode !== "ALWAYS" && schedule.mode !== "CUSTOM_DATES";
  const invalidField = parsed.success ? undefined : (parsed.issues[0]?.path?.[0]?.key ?? "endsOn");
  const invalid = (field: string) => showValidationErrors && invalidField === field;
  useEffect(() => {
    if (showValidationErrors && validationAttempt >= 0) {
      section.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [showValidationErrors, validationAttempt]);

  function rememberCurrent() {
    if (schedule.mode === "ALWAYS") return;
    remembered.current[schedule.mode] = schedule;
    lastMode.current = schedule.mode;
    if (schedule.mode !== "CUSTOM_DATES") {
      rememberedBounds.current = { startsOn: schedule.startsOn, endsOn: schedule.endsOn };
    }
  }
  function chooseMode(mode: Exclude<AvailabilitySchedule["mode"], "ALWAYS">) {
    rememberCurrent();
    const previous = remembered.current[mode];
    const next =
      previous ??
      ({
        mode,
        timezone: schedule.timezone,
        ...(mode === "WEEKDAYS"
          ? { weekdays: [] }
          : mode === "MONTH_WEEKS"
            ? { weeksOfMonth: [] }
            : mode === "YEAR_MONTHS"
              ? { monthsOfYear: [] }
              : { dates: [] }),
        ...(mode !== "CUSTOM_DATES" ? rememberedBounds.current : {}),
      } as AvailabilitySchedule);
    onChange({ ...next, timezone: schedule.timezone });
  }
  function moveMonth(delta: number) {
    const target = new Date(`${first}T12:00:00Z`);
    target.setUTCMonth(target.getUTCMonth() + delta);
    setMonth(target.toISOString().slice(0, 7));
  }
  function toggle(value: number) {
    const key =
      schedule.mode === "WEEKDAYS"
        ? "weekdays"
        : schedule.mode === "MONTH_WEEKS"
          ? "weeksOfMonth"
          : "monthsOfYear";
    const values: number[] = (schedule as any)[key] ?? [];
    onChange({
      ...schedule,
      [key]: (values.includes(value) ? values.filter((n) => n !== value) : [...values, value]).sort(
        (a, b) => a - b,
      ),
    } as AvailabilitySchedule);
  }
  return (
    <section
      ref={section}
      className="space-y-4 rounded-2xl border border-pink-100 p-4"
      aria-label="Product availability"
    >
      {showHeading && <h3 className="font-semibold">Availability</h3>}
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          aria-describedby={`${id}-enabled-help`}
          onChange={(e) => onActiveChange(e.target.checked)}
        />
        Product enabled
      </label>
      <p id={`${id}-enabled-help`} className="text-sm text-stone-600">
        Disabling this product hides it from customers, regardless of its schedule.
      </p>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={schedule.mode === "ALWAYS"}
          onChange={(e) => {
            if (e.target.checked) {
              rememberCurrent();
              onChange(alwaysAvailable(schedule.timezone));
            } else chooseMode(lastMode.current);
          }}
        />
        Always available
      </label>
      {!isActive && (
        <p className="text-sm text-amber-800">
          This product is manually inactive. Its schedule will apply when you activate it.
        </p>
      )}
      <section
        className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3"
        aria-label="Availability preview"
        aria-live="polite"
      >
        <p className="text-sm font-medium">
          Status:{" "}
          {preview
            ? statusLabels[preview.availabilityStatus]
            : isActive
              ? "Complete the schedule"
              : "Inactive"}
        </p>
        {preview?.nextActiveAt && (
          <p className="text-sm">
            Next active:{" "}
            <time dateTime={preview.nextActiveAt}>
              {new Intl.DateTimeFormat(undefined, {
                timeZone: schedule.timezone,
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(preview.nextActiveAt))}
            </time>
          </p>
        )}
        {preview?.availabilityStatus === "EXPIRED" && (
          <p className="text-sm">No upcoming active dates.</p>
        )}
        <p className="text-sm text-stone-600">
          {rule
            ? rule.mode === "ALWAYS"
              ? "Available every day while enabled."
              : scheduleSummary(rule)
            : showValidationErrors
              ? "Complete the schedule to see its summary."
              : validationMessage}
        </p>
      </section>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 break-words text-sm">
            Schedule timezone: <strong>{schedule.timezone || "Not selected"}</strong>
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            aria-expanded={changingTimezone || !timezoneValid}
            aria-controls={`${id}-timezone-editor`}
            onClick={() => setChangingTimezone(!changingTimezone)}
          >
            {changingTimezone ? "Done changing timezone" : "Change timezone"}
          </Button>
        </div>
        {(changingTimezone || !timezoneValid) && (
          <div id={`${id}-timezone-editor`} className="space-y-2">
            <label className="block text-sm font-medium" htmlFor={`${id}-zone`}>
              Schedule timezone
            </label>
            <input
              id={`${id}-zone`}
              list={`${id}-timezones`}
              className="min-h-11 w-full rounded-xl border border-stone-400 p-2"
              value={schedule.timezone}
              aria-invalid={invalid("timezone") || undefined}
              aria-describedby={invalid("timezone") ? `${id}-error` : `${id}-timezone-help`}
              onChange={(e) => onChange({ ...schedule, timezone: e.target.value })}
            />
            <datalist id={`${id}-timezones`}>
              {timezones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <p id={`${id}-timezone-help`} className="text-xs text-stone-600">
              Search for a city or IANA timezone. Selected days run from midnight to midnight in
              this timezone.
            </p>
          </div>
        )}
      </div>
      {schedule.mode !== "ALWAYS" && (
        <>
          <label className="block text-sm font-medium" htmlFor={`${id}-mode`}>
            Schedule mode
          </label>
          <select
            id={`${id}-mode`}
            className="min-h-11 w-full rounded-xl border p-2"
            value={schedule.mode}
            onChange={(e) =>
              chooseMode(e.target.value as Exclude<AvailabilitySchedule["mode"], "ALWAYS">)
            }
          >
            {modes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {schedule.mode !== "CUSTOM_DATES" && (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-medium">
                Active{" "}
                {schedule.mode === "WEEKDAYS"
                  ? "weekdays"
                  : schedule.mode === "MONTH_WEEKS"
                    ? "weeks of each month"
                    : "months of each year"}
              </legend>
              {(schedule.mode === "WEEKDAYS"
                ? weekdays
                : schedule.mode === "MONTH_WEEKS"
                  ? [
                      "Week 1 (days 1–7)",
                      "Week 2 (days 8–14)",
                      "Week 3 (days 15–21)",
                      "Week 4 (days 22–28)",
                      "Week 5 (days 29–month end)",
                    ]
                  : months
              ).map((label, index) => (
                <label key={label} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    aria-invalid={
                      (index === 0 &&
                        invalid(
                          schedule.mode === "WEEKDAYS"
                            ? "weekdays"
                            : schedule.mode === "MONTH_WEEKS"
                              ? "weeksOfMonth"
                              : "monthsOfYear",
                        )) ||
                      undefined
                    }
                    aria-describedby={
                      index === 0 && invalidField && showValidationErrors
                        ? `${id}-error`
                        : undefined
                    }
                    checked={(schedule.mode === "WEEKDAYS"
                      ? schedule.weekdays
                      : schedule.mode === "MONTH_WEEKS"
                        ? schedule.weeksOfMonth
                        : schedule.monthsOfYear
                    ).includes(index + 1)}
                    onChange={() => toggle(index + 1)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          {recurring && (
            <fieldset className="grid gap-3 rounded-xl border border-stone-200 p-3 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium">Optional date limits</legend>
              {(["startsOn", "endsOn"] as const).map((key) => (
                <label key={key} className="text-sm">
                  {key === "startsOn" ? "Starts on (optional)" : "Ends on (optional)"}
                  <input
                    type="date"
                    aria-invalid={invalid(key) || undefined}
                    aria-describedby={invalid(key) ? `${id}-error` : undefined}
                    className="mt-1 min-h-11 w-full rounded-xl border p-2"
                    value={(schedule as any)[key] ?? ""}
                    onChange={(e) => {
                      const next = { ...schedule } as any;
                      if (e.target.value) next[key] = e.target.value;
                      else delete next[key];
                      onChange(next);
                    }}
                  />
                </label>
              ))}
            </fieldset>
          )}
          <fieldset aria-label="Availability calendar" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 min-w-11"
                aria-label="Previous month"
                onClick={() => moveMonth(-1)}
              >
                ←
              </Button>
              <input
                type="month"
                aria-label="Calendar month and year"
                className="order-first min-h-11 w-full basis-full rounded-xl border p-2"
                value={month}
                onChange={(e) => {
                  if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 min-w-11"
                aria-label="Next month"
                onClick={() => moveMonth(1)}
              >
                →
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => setMonth(today.slice(0, 7))}
              >
                Today
              </Button>
            </div>
            <p className="text-xs text-stone-500">
              {schedule.mode === "CUSTOM_DATES"
                ? "Select exact dates. These dates do not repeat."
                : "Calendar previews your rule. Change the options above to edit it."}{" "}
              Highlighted dates match the schedule. The product must also be enabled to appear to
              customers.
            </p>
            <ul
              aria-label="Calendar legend"
              className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-700"
            >
              <li>
                <span aria-hidden="true" className="mr-1 font-bold">
                  ✓
                </span>
                {schedule.mode === "CUSTOM_DATES" ? "Selected custom date" : "Matches schedule"}
              </li>
              <li>
                <span aria-hidden="true" className="mr-1">
                  □
                </span>
                {schedule.mode === "CUSTOM_DATES" ? "Not selected" : "Does not match"}
              </li>
              <li>
                <span aria-hidden="true" className="mr-1">
                  ○
                </span>
                Today (outlined)
              </li>
            </ul>
            <div className="grid grid-cols-7 gap-1 text-center">
              {weekdays.map((d) => (
                <span key={d} className="text-xs text-stone-500">
                  {d.slice(0, 3)}
                </span>
              ))}
              {weekdays.slice(0, offset).map((day) => (
                <span key={`blank-${day}`} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const day = shiftDate(first, i);
                const selected = rule
                  ? scheduleMatchesDate(rule, day)
                  : schedule.mode === "CUSTOM_DATES" && schedule.dates.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={`${day}${day === today ? ", today" : ""}`}
                    aria-pressed={selected}
                    aria-current={day === today ? "date" : undefined}
                    aria-invalid={(i === 0 && invalid("dates")) || undefined}
                    aria-describedby={i === 0 && invalid("dates") ? `${id}-error` : undefined}
                    disabled={schedule.mode !== "CUSTOM_DATES"}
                    className={`relative min-h-11 rounded-lg border text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-700 disabled:opacity-100 ${selected ? "border-pink-700 bg-pink-700 text-white" : "border-stone-200 bg-stone-50 text-stone-600"} ${day === today ? "ring-2 ring-pink-400" : ""}`}
                    onClick={() => {
                      if (schedule.mode === "CUSTOM_DATES")
                        onChange({
                          ...schedule,
                          dates: (schedule.dates.includes(day)
                            ? schedule.dates.filter((d) => d !== day)
                            : [...schedule.dates, day]
                          ).sort(),
                        });
                    }}
                  >
                    {i + 1}
                    {selected && (
                      <span
                        aria-hidden="true"
                        className="absolute right-0.5 top-0 text-[10px] font-bold"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {schedule.mode === "CUSTOM_DATES" && (
            <div>
              <div className="flex items-center justify-between text-sm">
                <span>
                  {schedule.dates.length} selected {schedule.dates.length === 1 ? "date" : "dates"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  disabled={schedule.dates.length === 0}
                  onClick={() => onChange({ ...schedule, dates: [] })}
                >
                  Clear all dates
                </Button>
              </div>
              <ul className="max-h-40 space-y-1 overflow-auto">
                {[...schedule.dates].sort().map((day) => (
                  <li key={day} className="flex items-center justify-between text-sm">
                    <time dateTime={day}>{day}</time>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      aria-label={`Remove ${day}`}
                      onClick={() =>
                        onChange({ ...schedule, dates: schedule.dates.filter((d) => d !== day) })
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {showValidationErrors && !parsed.success && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700">
          {validationMessage}
        </p>
      )}
      <p className="text-xs text-stone-500">
        Availability changes apply to every published page that includes this product’s category.
      </p>
    </section>
  );
}
