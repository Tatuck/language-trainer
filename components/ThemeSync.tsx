"use client";

import { useEffect } from "react";
import { watchSystemTheme } from "@/lib/theme";

/** Keeps <html data-theme> in step with the OS while the learner follows the system theme. Renders nothing. */
export function ThemeSync() {
  useEffect(() => watchSystemTheme(), []);
  return null;
}
