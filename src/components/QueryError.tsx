import { Icon } from "@iconify/react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export function QueryError({
  message = "We couldn’t load this information.",
  retry,
}: {
  message?: string;
  retry: () => void;
}) {
  return (
    <Card role="alert" className="grid min-h-64 place-items-center border-red-200 bg-red-50/40 p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-100 text-red-700">
          <Icon icon="solar:danger-triangle-linear" className="size-6" />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-stone-500">{message}</p>
        <Button className="mt-5" variant="outline" onClick={retry}>
          <Icon icon="solar:refresh-linear" />
          Try again
        </Button>
      </div>
    </Card>
  );
}
