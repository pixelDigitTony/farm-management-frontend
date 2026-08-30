const configuredBaseDomain = (import.meta.env.VITE_PUBLIC_SITE_BASE_DOMAIN ?? "")
  .trim()
  .toLowerCase()
  .replace(/^\.+|\.+$/g, "");

export function getPublicSiteSlugFromHostname(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!configuredBaseDomain || normalizedHostname === configuredBaseDomain) return undefined;
  const suffix = `.${configuredBaseDomain}`;
  if (!normalizedHostname.endsWith(suffix)) return undefined;
  const slug = normalizedHostname.slice(0, -suffix.length);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : undefined;
}

export function getPublicSiteUrl(slug: string) {
  if (!configuredBaseDomain) return `${window.location.origin}/site/${slug}`;
  return `https://${slug}.${configuredBaseDomain}`;
}
