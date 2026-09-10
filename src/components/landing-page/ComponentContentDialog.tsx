import { cloneElement, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { LandingPageComponent } from "@/types/landing-page";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="text-sm font-medium text-stone-700">
      <label htmlFor={id}>{label}</label>
      <div className="mt-1">{cloneElement(children, { id })}</div>
    </div>
  );
}
const textAreaClass =
  "min-h-32 w-full resize-y rounded-xl border border-pink-100 bg-white px-3 py-2 text-sm outline-none focus:border-pink-600 focus:ring-3 focus:ring-pink-600/10";

export function ComponentContentDialog({
  initialComponent,
  onApply,
  onClose,
}: {
  initialComponent: LandingPageComponent;
  onApply: (component: LandingPageComponent) => void;
  onClose: () => void;
}) {
  const [component, setComponent] = useState(initialComponent);
  const [mediaUrls, setMediaUrls] = useState(
    initialComponent.type === "GALLERY" ? initialComponent.content.mediaUrls.join("\n") : "",
  );
  const replaceContent = (content: LandingPageComponent["content"]) =>
    setComponent({ ...component, content } as LandingPageComponent);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden p-0"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="border-b border-pink-100 px-6 py-5 pr-14">
          <DialogTitle>Edit content</DialogTitle>
          <DialogDescription>
            Write your message and add links or media. Apply changes to preview them on your page.
          </DialogDescription>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onApply(
              component.type === "GALLERY"
                ? {
                    ...component,
                    content: {
                      ...component.content,
                      mediaUrls: mediaUrls
                        .split("\n")
                        .map((url) => url.trim())
                        .filter(Boolean),
                    },
                  }
                : component,
            );
            onClose();
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {component.type === "HERO" && (
              <>
                <Field label="Eyebrow">
                  <Input
                    value={component.content.eyebrow}
                    onChange={(e) =>
                      replaceContent({ ...component.content, eyebrow: e.target.value })
                    }
                  />
                </Field>
                <Field label="Headline">
                  <Input
                    value={component.content.title}
                    onChange={(e) =>
                      replaceContent({ ...component.content, title: e.target.value })
                    }
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    className={textAreaClass}
                    value={component.content.body}
                    onChange={(e) => replaceContent({ ...component.content, body: e.target.value })}
                  />
                </Field>
                <Field label="Public media URL">
                  <Input
                    type="url"
                    value={component.content.mediaUrl}
                    onChange={(e) =>
                      replaceContent({ ...component.content, mediaUrl: e.target.value })
                    }
                    placeholder="https://..."
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Primary button">
                    <Input
                      value={component.content.primaryLabel}
                      onChange={(e) =>
                        replaceContent({ ...component.content, primaryLabel: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Primary link">
                    <Input
                      value={component.content.primaryUrl}
                      onChange={(e) =>
                        replaceContent({ ...component.content, primaryUrl: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Secondary button">
                    <Input
                      value={component.content.secondaryLabel}
                      onChange={(e) =>
                        replaceContent({ ...component.content, secondaryLabel: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Secondary link">
                    <Input
                      value={component.content.secondaryUrl}
                      onChange={(e) =>
                        replaceContent({ ...component.content, secondaryUrl: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </>
            )}
            {component.type === "TEXT" && (
              <>
                <Field label="Heading">
                  <Input
                    value={component.content.heading}
                    onChange={(e) =>
                      replaceContent({ ...component.content, heading: e.target.value })
                    }
                  />
                </Field>
                <Field label="Body">
                  <textarea
                    className={textAreaClass}
                    value={component.content.body}
                    onChange={(e) => replaceContent({ ...component.content, body: e.target.value })}
                  />
                </Field>
              </>
            )}
            {component.type === "MENU" && (
              <>
                <Field label="Heading">
                  <Input
                    value={component.content.heading}
                    onChange={(e) =>
                      replaceContent({ ...component.content, heading: e.target.value })
                    }
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    className={textAreaClass}
                    value={component.content.body}
                    onChange={(e) => replaceContent({ ...component.content, body: e.target.value })}
                  />
                </Field>
              </>
            )}
            {component.type === "CATALOG" && (
              <>
                <Field label="Heading">
                  <Input
                    value={component.content.heading}
                    onChange={(event) =>
                      replaceContent({ ...component.content, heading: event.target.value })
                    }
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    className={textAreaClass}
                    value={component.content.body}
                    onChange={(event) =>
                      replaceContent({ ...component.content, body: event.target.value })
                    }
                  />
                </Field>
              </>
            )}
            {component.type === "GALLERY" && (
              <>
                <Field label="Heading">
                  <Input
                    value={component.content.heading}
                    onChange={(e) =>
                      replaceContent({ ...component.content, heading: e.target.value })
                    }
                  />
                </Field>
                <Field label="Media URLs (one per line)">
                  <textarea
                    className={textAreaClass}
                    value={mediaUrls}
                    onChange={(event) => setMediaUrls(event.target.value)}
                    placeholder="https://..."
                  />
                </Field>
              </>
            )}
            {component.type === "CONTACT" && (
              <>
                <Field label="Heading">
                  <Input
                    value={component.content.heading}
                    onChange={(e) =>
                      replaceContent({ ...component.content, heading: e.target.value })
                    }
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    className={textAreaClass}
                    value={component.content.body}
                    onChange={(e) => replaceContent({ ...component.content, body: e.target.value })}
                  />
                </Field>
                <Field label="Address">
                  <Input
                    value={component.content.address}
                    onChange={(e) =>
                      replaceContent({ ...component.content, address: e.target.value })
                    }
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Phone">
                    <Input
                      value={component.content.phone}
                      onChange={(e) =>
                        replaceContent({ ...component.content, phone: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      value={component.content.email}
                      onChange={(e) =>
                        replaceContent({ ...component.content, email: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Business hours">
                  <textarea
                    className={textAreaClass}
                    value={component.content.hours}
                    onChange={(e) =>
                      replaceContent({ ...component.content, hours: e.target.value })
                    }
                  />
                </Field>
                <Field label="Facebook URL">
                  <Input
                    type="url"
                    value={component.content.facebookUrl}
                    onChange={(e) =>
                      replaceContent({ ...component.content, facebookUrl: e.target.value })
                    }
                  />
                </Field>
                <Field label="Instagram URL">
                  <Input
                    type="url"
                    value={component.content.instagramUrl}
                    onChange={(e) =>
                      replaceContent({ ...component.content, instagramUrl: e.target.value })
                    }
                  />
                </Field>
                <Field label="Map URL">
                  <Input
                    type="url"
                    value={component.content.mapUrl}
                    onChange={(e) =>
                      replaceContent({ ...component.content, mapUrl: e.target.value })
                    }
                  />
                </Field>
              </>
            )}
            {component.type === "CTA" && (
              <>
                <Field label="Heading">
                  <Input
                    value={component.content.heading}
                    onChange={(e) =>
                      replaceContent({ ...component.content, heading: e.target.value })
                    }
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    className={textAreaClass}
                    value={component.content.body}
                    onChange={(e) => replaceContent({ ...component.content, body: e.target.value })}
                  />
                </Field>
                <Field label="Button label">
                  <Input
                    value={component.content.buttonLabel}
                    onChange={(e) =>
                      replaceContent({ ...component.content, buttonLabel: e.target.value })
                    }
                  />
                </Field>
                <Field label="Button link">
                  <Input
                    value={component.content.buttonUrl}
                    onChange={(e) =>
                      replaceContent({ ...component.content, buttonUrl: e.target.value })
                    }
                  />
                </Field>
              </>
            )}
          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-pink-100 px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Apply changes</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
