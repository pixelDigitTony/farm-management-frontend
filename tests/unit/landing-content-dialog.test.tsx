import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ComponentContentDialog } from "@/components/landing-page/ComponentContentDialog";
import { createLandingComponent } from "@/types/landing-page";

describe("landing content composer", () => {
  it("stages written content until Apply and keeps layout fields out of the dialog", () => {
    const original = createLandingComponent("HERO");
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <ComponentContentDialog initialComponent={original} onApply={onApply} onClose={onClose} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Headline" }), {
      target: { value: "Fresh meals every day" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Public media URL" }), {
      target: { value: "https://example.com/photo.jpg" },
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByText("Width")).not.toBeInTheDocument();
    expect(screen.queryByText("Button text color")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        width: original.width,
        content: expect.objectContaining({
          title: "Fresh meals every day",
          mediaUrl: "https://example.com/photo.jpg",
        }),
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    if (original.type === "HERO") expect(original.content.title).toBe("Your headline");
  });
  it("discards edits when Cancel or Escape closes the dialog", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <ComponentContentDialog
        initialComponent={createLandingComponent("TEXT")}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Unsaved draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
  });
  it("lets gallery links be typed on separate lines before applying", () => {
    const onApply = vi.fn();
    render(
      <ComponentContentDialog
        initialComponent={createLandingComponent("GALLERY")}
        onApply={onApply}
        onClose={() => {}}
      />,
    );
    const media = screen.getByRole("textbox", { name: "Media URLs (one per line)" });
    fireEvent.change(media, { target: { value: "https://example.com/one.jpg\n" } });
    expect(media).toHaveValue("https://example.com/one.jpg\n");
    fireEvent.change(media, {
      target: { value: "https://example.com/one.jpg\nhttps://example.com/two.jpg\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          mediaUrls: ["https://example.com/one.jpg", "https://example.com/two.jpg"],
        }),
      }),
    );
  });
});
