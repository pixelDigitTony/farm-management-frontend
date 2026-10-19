import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ProductAvailabilityEditor } from "@/components/ProductAvailabilityEditor";
import { type AvailabilitySchedule, alwaysAvailable } from "@/lib/product-availability";

function Editor({
  initialRule = alwaysAvailable(),
  initiallyActive = false,
}: {
  initialRule?: AvailabilitySchedule;
  initiallyActive?: boolean;
}) {
  const [rule, setRule] = useState<AvailabilitySchedule>(initialRule);
  const [active, setActive] = useState(initiallyActive);
  const [attempts, setAttempts] = useState(0);
  return (
    <>
      <ProductAvailabilityEditor
        schedule={rule}
        isActive={active}
        onChange={setRule}
        onActiveChange={setActive}
        showValidationErrors={attempts > 0}
        validationAttempt={attempts}
        now={Date.parse("2026-10-18T16:00:00Z")}
      />
      <button type="button" onClick={() => setAttempts((value) => value + 1)}>
        Save availability
      </button>
      <output aria-label="Saved form value">{JSON.stringify(rule)}</output>
    </>
  );
}
describe("product availability editor", () => {
  it("retains each mode's unfinished choices and date limits throughout the dialog session", () => {
    render(
      <Editor
        initialRule={{
          mode: "WEEKDAYS",
          timezone: "Asia/Manila",
          weekdays: [1],
          startsOn: "2027-01-01",
          endsOn: "2027-12-31",
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Schedule mode"), { target: { value: "YEAR_MONTHS" } });
    expect(screen.getByLabelText("Starts on (optional)")).toHaveValue("2027-01-01");
    fireEvent.click(screen.getByRole("checkbox", { name: "December" }));
    fireEvent.change(screen.getByLabelText("Schedule mode"), { target: { value: "CUSTOM_DATES" } });
    fireEvent.change(screen.getByLabelText("Calendar month and year"), {
      target: { value: "2028-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "2028-02-29" }));
    fireEvent.change(screen.getByLabelText("Schedule mode"), { target: { value: "WEEKDAYS" } });
    expect(screen.getByRole("checkbox", { name: "Monday" })).toBeChecked();
    expect(screen.getByLabelText("Ends on (optional)")).toHaveValue("2027-12-31");
    fireEvent.change(screen.getByLabelText("Schedule mode"), { target: { value: "YEAR_MONTHS" } });
    expect(screen.getByRole("checkbox", { name: "December" })).toBeChecked();
    fireEvent.change(screen.getByLabelText("Schedule mode"), { target: { value: "CUSTOM_DATES" } });
    expect(screen.getByRole("button", { name: "Remove 2028-02-29" })).toBeVisible();
  });
  it("keeps invalid timezone correction visible and focuses it even after selecting Always", () => {
    render(<Editor initialRule={{ mode: "WEEKDAYS", timezone: "Asia/Manila", weekdays: [1] }} />);
    expect(screen.queryByLabelText("Schedule timezone", { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change timezone" }));
    fireEvent.change(screen.getByLabelText("Schedule timezone", { exact: true }), {
      target: { value: "Invalid/Timezone" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Always available" }));
    fireEvent.click(screen.getByRole("button", { name: "Done changing timezone" }));
    expect(screen.getByLabelText("Schedule timezone", { exact: true })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid timezone");
    expect(screen.getByLabelText("Schedule timezone", { exact: true })).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Schedule timezone", { exact: true }), {
      target: { value: "UTC" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(JSON.parse(screen.getByLabelText("Saved form value").textContent ?? "{}")).toEqual({
      mode: "ALWAYS",
      timezone: "UTC",
    });
  });
  it("previews scheduled, current and manually inactive status using the supplied server time", () => {
    render(
      <Editor
        initiallyActive
        initialRule={{ mode: "WEEKDAYS", timezone: "Asia/Manila", weekdays: [2] }}
      />,
    );
    const preview = screen.getByRole("region", { name: "Availability preview" });
    expect(preview).toHaveTextContent("Status: Scheduled");
    expect(preview.querySelector("time")).toHaveAttribute("datetime", "2026-10-19T16:00:00.000Z");
    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    expect(preview).toHaveTextContent("Status: Active now");
    fireEvent.click(screen.getByRole("checkbox", { name: "Product enabled" }));
    expect(preview).toHaveTextContent("Status: Inactive");
    expect(within(preview).queryByText(/Next active/)).not.toBeInTheDocument();
    expect(screen.getByText(/Highlighted dates match the schedule/)).toBeVisible();
  });
  it("identifies an expired schedule and communicates calendar states without color alone", () => {
    render(
      <Editor
        initiallyActive
        initialRule={{ mode: "CUSTOM_DATES", timezone: "Asia/Manila", dates: ["2026-10-18"] }}
      />,
    );
    expect(screen.getByRole("region", { name: "Availability preview" })).toHaveTextContent(
      "Status: Expired",
    );
    expect(screen.getByText("No upcoming active dates.")).toBeVisible();
    expect(screen.getByRole("list", { name: "Calendar legend" })).toHaveTextContent(
      "Selected custom date",
    );
    const selected = screen.getByRole("button", { name: "2026-10-18" });
    expect(selected).toHaveTextContent("✓");
    expect(screen.getByRole("button", { name: "2026-10-19, today" })).toHaveAttribute(
      "aria-current",
      "date",
    );
  });
  it("focuses the invalid date limit and recurrence selection on each save attempt", () => {
    render(
      <Editor
        initialRule={{
          mode: "WEEKDAYS",
          timezone: "Asia/Manila",
          weekdays: [1],
          startsOn: "2027-12-31",
          endsOn: "2027-01-01",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect(screen.getByLabelText("Ends on (optional)")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Ends on (optional)"), {
      target: { value: "2027-12-31" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect(screen.getByRole("checkbox", { name: "Monday" })).toHaveFocus();
  });
  it("hides recurrence/calendar for Always and keeps manual activation independent", () => {
    render(<Editor />);
    expect(screen.queryByLabelText("Schedule mode")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Availability calendar" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Product enabled" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Always available" }));
    expect(screen.getByLabelText("Schedule mode")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Always available" }));
    expect(screen.queryByLabelText("Schedule mode")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Product enabled" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Always available" }));
    expect(screen.getByRole("checkbox", { name: "Monday" })).toBeChecked();
  });
  it("selects custom dates across months/years without creating a recurrence", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Always available" }));
    fireEvent.change(screen.getByLabelText("Schedule mode"), { target: { value: "CUSTOM_DATES" } });
    const month = screen.getByLabelText("Calendar month and year");
    fireEvent.change(month, { target: { value: "2026-12" } });
    fireEvent.click(screen.getByRole("button", { name: "2026-12-24" }));
    fireEvent.change(month, { target: { value: "2027-01" } });
    fireEvent.click(screen.getByRole("button", { name: "2027-01-02" }));
    expect(JSON.parse(screen.getByLabelText("Saved form value").textContent ?? "{}").dates).toEqual(
      ["2026-12-24", "2027-01-02"],
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove 2026-12-24" }));
    expect(screen.queryByRole("button", { name: "Remove 2026-12-24" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all dates" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Select at least one calendar date.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select at least one calendar date.");
  });

  it.each<{ rule: AvailabilitySchedule; message: string }>([
    {
      rule: { mode: "WEEKDAYS", timezone: "Asia/Manila", weekdays: [] },
      message: "Select at least one weekday.",
    },
    {
      rule: { mode: "MONTH_WEEKS", timezone: "Asia/Manila", weeksOfMonth: [] },
      message: "Select at least one week of the month.",
    },
    {
      rule: { mode: "YEAR_MONTHS", timezone: "Asia/Manila", monthsOfYear: [] },
      message: "Select at least one month of the year.",
    },
    {
      rule: { mode: "CUSTOM_DATES", timezone: "Asia/Manila", dates: [] },
      message: "Select at least one calendar date.",
    },
  ])("waits for save before reporting an incomplete $rule.mode schedule", ({ rule, message }) => {
    render(<Editor initialRule={rule} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(message)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(/Invalid length/)).not.toBeInTheDocument();
  });

  it("clears validation feedback after fixing a weekday or selecting Always", () => {
    render(<Editor initialRule={{ mode: "WEEKDAYS", timezone: "Asia/Manila", weekdays: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect(screen.getByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    expect(screen.getByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Always available" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("exposes explicit week ranges and calendar preview, then supports yearly months", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Always available" }));
    fireEvent.change(screen.getByLabelText("Schedule mode"), { target: { value: "MONTH_WEEKS" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Week 2 (days 8–14)" }));
    fireEvent.change(screen.getByLabelText("Calendar month and year"), {
      target: { value: "2026-10" },
    });
    const calendar = screen.getByRole("group", { name: "Availability calendar" });
    expect(within(calendar).getByRole("button", { name: "2026-10-08" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(calendar).getByRole("button", { name: "2026-10-15" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.change(screen.getByLabelText("Schedule mode"), { target: { value: "YEAR_MONTHS" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "December" }));
    expect(
      JSON.parse(screen.getByLabelText("Saved form value").textContent ?? "{}").monthsOfYear,
    ).toEqual([12]);
  });
});
