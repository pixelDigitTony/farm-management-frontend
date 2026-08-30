import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

type GoogleDriveMediaFieldsProps = {
  links: MenuMediaLink[];
  onChange: (links: MenuMediaLink[]) => void;
};

export type MenuMediaLink = { id: string; value: string };

export function createMenuMediaLinks(values: string[] = []) {
  return (values.length ? values : [""]).map((value) => ({ id: crypto.randomUUID(), value }));
}

export function MenuMediaFields({ links, onChange }: GoogleDriveMediaFieldsProps) {
  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>Menu images and videos</Label>
          <p className="text-xs text-stone-500">
            Add public Google Drive files, YouTube videos, Instagram posts/Reels, or Facebook
            videos/Reels.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={links.length >= 20}
          onClick={() => onChange([...links, ...createMenuMediaLinks()])}
        >
          <Icon icon="solar:add-circle-linear" /> Add media link
        </Button>
      </div>

      {links.map((link, index) => (
        <div key={link.id} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            type="url"
            value={link.value}
            aria-label={`Menu media link ${index + 1}`}
            placeholder="Paste a Drive, YouTube, Instagram, or Facebook link"
            onChange={(event) =>
              onChange(
                links.map((item) =>
                  item.id === link.id ? { ...item, value: event.target.value } : item,
                ),
              )
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove menu media link ${index + 1}`}
            onClick={() => {
              const next = links.filter((item) => item.id !== link.id);
              onChange(next.length ? next : createMenuMediaLinks());
            }}
          >
            <Icon icon="solar:trash-bin-trash-linear" />
          </Button>
        </div>
      ))}
    </div>
  );
}
