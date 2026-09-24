"use client";

import { useNavigate, useSearch } from "@tanstack/react-router";

/**
 * Reusable hook for URL-backed pagination in admin routes.
 * Uses TanStack Router search params for ?page=N state.
 */
export function useUrlPagination(defaultPageSize = 10) {
  const search = useSearch({ strict: false }) as Record<string, any>;
  const navigate = useNavigate();

  const page = Number(search?.page) || 1;
  const pageSize = defaultPageSize;

  const setPage = (newPage: number) => {
    navigate({ search: { ...search, page: newPage } as any, replace: true });
  };

  const resetPage = () => setPage(1);

  return { page, pageSize, setPage, resetPage };
}
