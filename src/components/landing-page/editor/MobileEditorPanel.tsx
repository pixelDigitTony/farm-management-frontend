import { type ReactNode, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function MobileEditorPanel({
  mobile,
  open,
  title,
  close,
  children,
  saveStatus,
  saveError,
  onRetry,
}: {
  mobile: boolean;
  open: boolean;
  title: string;
  close: () => void;
  children: ReactNode;
  saveStatus?: string;
  saveError?: string;
  onRetry?: () => void;
}) {
  const opener = useRef<HTMLElement | null>(null);
  const [visibleHeight, setVisibleHeight] = useState<number>();
  useEffect(() => {
    if (!mobile || !open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const resize = () => {
      setVisibleHeight(viewport.height);
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.matches("input,select,textarea"))
        focused.scrollIntoView({ block: "nearest" });
    };
    resize();
    viewport.addEventListener("resize", resize);
    return () => viewport.removeEventListener("resize", resize);
  }, [mobile, open]);
  if (!mobile) return <>{children}</>;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent
        className="lb-mobile-panel"
        style={{ height: visibleHeight }}
        onOpenAutoFocus={() => {
          opener.current = document.activeElement as HTMLElement;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => {
            if (!document.querySelector('[role="dialog"]'))
              (opener.current?.isConnected
                ? opener.current
                : document.querySelector<HTMLElement>(".lb-phone-tools button")
              )?.focus();
          });
        }}
      >
        <header className="lb-mobile-panel-heading">
          <button type="button" onClick={close}>
            ← Back to canvas
          </button>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Landing page editor tools</DialogDescription>
          {saveStatus && (
            <p className="lb-mobile-save" role="status">
              {saveStatus === "saved"
                ? "Saved"
                : saveStatus === "saving"
                  ? "Saving…"
                  : saveStatus === "error"
                    ? "Not saved"
                    : "Changes pending"}
              {saveStatus === "error" && (
                <button type="button" onClick={onRetry}>
                  Retry
                </button>
              )}
            </p>
          )}
          {saveError && <p role="alert">{saveError}</p>}
        </header>
        {children}
      </DialogContent>
    </Dialog>
  );
}
