export function landingValidationMessage(
  issue: { message: string; path?: readonly { key: unknown }[] } | undefined,
) {
  if (!issue) return "Complete the required fields before this draft can save";
  const keys = issue.path?.map((part) => String(part.key)) ?? [];
  const parts: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const group = (
      { sections: "Section", components: "Block", entries: "Entry" } as Record<string, string>
    )[key];
    if (group && /^\d+$/.test(keys[i + 1] ?? "")) parts.push(`${group} ${Number(keys[++i]) + 1}`);
  }
  const field = (keys.at(-1) ?? "field").replace(/([a-z])([A-Z])/g, "$1 $2");
  parts.push(field.charAt(0).toUpperCase() + field.slice(1));
  return `${parts.join(" → ")}: ${issue.message.startsWith("Invalid length") ? `Check the ${field}; it is empty or exceeds the allowed length.` : issue.message}`;
}
