"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminGetDashboardStats, adminGetAnalyticsData } from "@/lib/admin/server-fns";

interface DashboardDataContextValue {
  stats: any;
  analytics: any;
  loading: boolean;
  refresh: () => void;
}

const DashboardDataContext = createContext<DashboardDataContextValue>({
  stats: null,
  analytics: null,
  loading: true,
  refresh: () => {},
});

export function useDashboardData() {
  return useContext(DashboardDataContext);
}

export function DashboardDataProvider({
  children,
  initialStats = null,
  initialAnalytics = null,
}: {
  children: ReactNode;
  initialStats?: any;
  initialAnalytics?: any;
}) {
  const [stats, setStats] = useState<any>(initialStats);
  const [analytics, setAnalytics] = useState<any>(initialAnalytics);
  const [loading, setLoading] = useState(!initialStats && !initialAnalytics);

  const fetchStats = useServerFn(adminGetDashboardStats);
  const fetchAnalytics = useServerFn(adminGetAnalyticsData);

  // In-flight dedupe: overlapping refresh() calls (multiple widgets, a widget
  // plus a user action) join the SAME request instead of each firing a fresh
  // pair of serverFn calls.
  const inFlight = useRef<Promise<void> | null>(null);
  const loadData = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    setLoading(true);
    const run = Promise.all([fetchStats(), fetchAnalytics()])
      .then(([statsRes, analyticsRes]) => {
        if (statsRes?.stats) setStats(statsRes.stats);
        if (analyticsRes?.data) setAnalytics(analyticsRes.data);
      })
      .catch(() => {
        // Fail silently — widgets show empty states
      })
      .finally(() => {
        setLoading(false);
        inFlight.current = null;
      });
    inFlight.current = run;
    return run;
  }, [fetchStats, fetchAnalytics]);

  // Only fetch client-side if no initial data from loader
  const fetchedOnMount = useRef(false);
  useEffect(() => {
    if (fetchedOnMount.current) return;
    fetchedOnMount.current = true;
    if (!initialStats && !initialAnalytics) void loadData();
  }, [initialStats, initialAnalytics, loadData]);

  return (
    <DashboardDataContext.Provider value={{ stats, analytics, loading, refresh: loadData }}>
      {children}
    </DashboardDataContext.Provider>
  );
}
