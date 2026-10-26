import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function validMpin(value: string) {
  return (
    /^[0-9]{6}$/.test(value) && !/^(.)\1{5}$/.test(value) && !["123456", "654321"].includes(value)
  );
}
export function TemporaryMpin({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [native, setNative] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number>();
  const firstKey = useRef<HTMLButtonElement>(null);
  const slots = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    if (!open) return;
    const update = () => setViewportHeight(window.visualViewport?.height);
    update();
    window.visualViewport?.addEventListener("resize", update);
    return () => window.visualViewport?.removeEventListener("resize", update);
  }, [open]);
  const put = (digit: string) => {
    setError("");
    const next = (draft.slice(0, position) + digit + draft.slice(position + 1)).slice(0, 6);
    setDraft(next);
    setPosition(Math.min(5, position + 1));
    if (native) slots.current[Math.min(5, position + 1)]?.focus();
  };
  const backspace = () => {
    setError("");
    const index = draft.length > position ? position : Math.max(0, position - 1);
    setDraft(draft.slice(0, index) + draft.slice(index + 1));
    setPosition(Math.max(0, index - 1));
  };
  return (
    <div className="space-y-2">
      <input type="hidden" name="mpin" value={value} />
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        aria-label="Set temporary MPIN"
        onClick={() => {
          setDraft(value);
          setPosition(Math.min(value.length, 5));
          setNative(false);
          setError("");
          setOpen(true);
        }}
      >
        {value ? "● ● ● ● ● ●" : "Set 6-digit MPIN"}
        <span className="text-xs">{value ? "Edit" : "Open keypad"}</span>
      </Button>
      <p className="text-xs normal-case tracking-normal text-stone-500">
        Enter exactly 6 numbers (0–9). Avoid repeated digits and simple sequences. Example: 482907.
      </p>
      {value && (
        <button
          type="button"
          className="text-xs text-pink-700 underline"
          onClick={() => onChange("")}
        >
          Clear MPIN
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-sm p-4 sm:p-6"
          style={{
            maxHeight: viewportHeight ? viewportHeight - 24 : "calc(100dvh - 24px)",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            firstKey.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey || event.altKey || native) return;
            if (/^[0-9]$/.test(event.key)) {
              event.preventDefault();
              put(event.key);
            } else if (event.key === "Backspace" || event.key === "Delete") {
              event.preventDefault();
              backspace();
            } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              setPosition((p) =>
                Math.max(0, Math.min(5, p + (event.key === "ArrowLeft" ? -1 : 1))),
              );
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData("text");
            if (/^[0-9]{6}$/.test(text)) {
              setDraft(text);
              setPosition(5);
              setError("");
            } else setError("Paste exactly 6 numbers without spaces.");
          }}
        >
          <DialogTitle>Set temporary MPIN</DialogTitle>
          <DialogDescription>
            Use exactly 6 numbers. Letters, spaces, repeated digits, and simple sequences are not
            allowed.
          </DialogDescription>
          <fieldset className="my-5 grid grid-cols-6 gap-1.5" aria-label="Six-digit MPIN">
            {["first", "second", "third", "fourth", "fifth", "sixth"].map((slot, index) => (
              <input
                key={slot}
                ref={(node) => {
                  slots.current[index] = node;
                }}
                type="number"
                min={0}
                max={9}
                step={1}
                inputMode={native ? "numeric" : "none"}
                readOnly={!native}
                value={draft[index] ?? ""}
                aria-label={`MPIN digit ${index + 1} of 6`}
                aria-invalid={Boolean(error)}
                className={`h-12 min-w-0 rounded-lg border text-center text-xl [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${index === position ? "border-pink-600 ring-1 ring-pink-600" : "border-stone-300"}`}
                onFocus={() => setPosition(index)}
                onWheel={(event) => event.currentTarget.blur()}
                onKeyDown={(event) => {
                  if (native && /^[0-9]$/.test(event.key)) {
                    event.preventDefault();
                    put(event.key);
                  }
                  if (["e", "E", "+", "-", ".", " ", "ArrowUp", "ArrowDown"].includes(event.key))
                    event.preventDefault();
                  if (native && event.key === "Backspace") {
                    event.preventDefault();
                    backspace();
                  }
                }}
                onChange={(event) => {
                  const digit = event.target.value;
                  setPosition(index);
                  if (/^[0-9]$/.test(digit)) put(digit);
                  else if (!digit)
                    setDraft((current) => current.slice(0, index) + current.slice(index + 1));
                  else setError("Use one number in each box.");
                }}
              />
            ))}
          </fieldset>
          <p role="status" className="min-h-5 text-sm text-red-700">
            {error ||
              (draft.length === 6 && !validMpin(draft) ? "Choose a less predictable MPIN." : "")}
          </p>
          {!native && (
            <div className="my-3 grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "Backspace"].map(
                (key, index) => (
                  <Button
                    ref={index === 0 ? firstKey : undefined}
                    key={key}
                    type="button"
                    variant="outline"
                    className="h-11 px-1"
                    onClick={() => {
                      if (key === "Clear") {
                        setDraft("");
                        setPosition(0);
                      } else if (key === "Backspace") backspace();
                      else put(key);
                    }}
                  >
                    {key}
                  </Button>
                ),
              )}
            </div>
          )}
          <button
            type="button"
            className="my-2 text-sm text-pink-700 underline"
            onClick={() => {
              setNative((current) => !current);
              if (!native) setTimeout(() => slots.current[position]?.focus(), 0);
            }}
          >
            {native ? "Use on-screen keypad" : "Use device keyboard"}
          </button>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-11 flex-1"
              disabled={!validMpin(draft)}
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Use MPIN
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
