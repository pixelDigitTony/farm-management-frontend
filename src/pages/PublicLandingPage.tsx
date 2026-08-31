import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import { LandingPageRenderer } from "@/components/landing-page/LandingPageRenderer";
import { PageSkeleton } from "@/components/ui/skeleton";
import type { LandingMenuItem, LandingPageSection, LandingPageTheme } from "@/types/landing-page";
import { normalizeLandingSections } from "@/types/landing-page";

type PublicLandingPage = {
  slug: string;
  siteTitle: string;
  seoDescription: string;
  publishedAt: string;
  variant: {
    theme: LandingPageTheme;
    sections?: LandingPageSection[];
    components?: LandingPageSection["components"];
  };
  menuItems: LandingMenuItem[];
};

export function PublicLandingPage({ slug: hostnameSlug }: { slug?: string }) {
  const { slug: routeSlug = "" } = useParams();
  const slug = hostnameSlug ?? routeSlug;
  const page = useQuery({
    queryKey: ["public-landing-page", slug],
    queryFn: () => api<PublicLandingPage>(`/public/landing-pages/${encodeURIComponent(slug)}`),
    retry: false,
  });
  useEffect(() => {
    if (!page.data) return;
    document.title = page.data.siteTitle;
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    description.content = page.data.seoDescription;
  }, [page.data]);

  if (page.isLoading)
    return (
      <div className="mx-auto max-w-6xl p-6">
        <PageSkeleton cards={4} />
      </div>
    );
  if (page.isError || !page.data)
    return (
      <main className="grid min-h-screen place-items-center bg-blush-50 p-6 text-center">
        <div>
          <p className="font-display text-5xl font-bold text-pink-700">404</p>
          <h1 className="mt-3 text-2xl font-bold">This page is not published</h1>
          <p className="mt-2 text-sm text-stone-500">
            Check the link or ask the business owner for the current address.
          </p>
        </div>
      </main>
    );
  return (
    <LandingPageRenderer
      theme={page.data.variant.theme}
      sections={normalizeLandingSections(page.data.variant)}
      menuItems={page.data.menuItems}
    />
  );
}
