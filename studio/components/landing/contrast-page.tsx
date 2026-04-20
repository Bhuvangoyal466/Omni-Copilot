"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { LaunchHero } from "@/components/landing/launch-hero";

interface ThemePageProps {
  targetTheme: "dark" | "light";
}

export function ContrastPage({ targetTheme }: ThemePageProps) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(targetTheme);
  }, [setTheme, targetTheme]);

  return <LaunchHero />;
}
