import { getRouteApi } from "@tanstack/react-router";

const rootRouteApi = getRouteApi("__root__");

export interface RootPublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
}

export interface RootPublicSocialLink {
  id: string;
  platform: string;
  url: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  link_type: string;
}

export interface RootLoaderData {
  socialLinks: RootPublicSocialLink[];
  siteSettings: Record<string, string>;
  categories: RootPublicCategory[];
  categoriesUnavailable: boolean;
  /** True when the latest shared-data read failed but last-known-good public business info is being shown. */
  sharedDataStale?: boolean;
}

/** Read the shared data returned by the root route loader. */
export function useRootLoaderData(): RootLoaderData {
  return rootRouteApi.useLoaderData() as RootLoaderData;
}
