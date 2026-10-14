"use client";

import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";
import { BrandLockup } from "@/components/brand/Logo";

export function getPlatformLogoHref(isNativePlatform: boolean): "/" | "/login" {
  return isNativePlatform ? "/login" : "/";
}

/**
 * Keep the normal website and installed PWA on the marketing homepage while
 * keeping the native Capacitor shell app-first. The server render deliberately
 * uses the web value; useSyncExternalStore keeps that server snapshot during
 * hydration and reads Capacitor only from the client snapshot afterwards.
 */
const subscribeToPlatform = () => () => {};
const getServerPlatform = () => false;
const getClientPlatform = () => Capacitor.isNativePlatform();

export function PlatformAwareBrandLockup({
  size = 32,
  tone = "light",
}: {
  size?: number;
  tone?: "light" | "dark";
}) {
  const isNativePlatform = useSyncExternalStore(subscribeToPlatform, getClientPlatform, getServerPlatform);

  return <BrandLockup href={getPlatformLogoHref(isNativePlatform)} size={size} tone={tone} />;
}
