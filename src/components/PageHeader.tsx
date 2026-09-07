export function Header({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-stone-500">{description}</p>
      </div>
      {children}
    </div>
  );
}
