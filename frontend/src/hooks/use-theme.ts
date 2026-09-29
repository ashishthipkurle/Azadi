import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { storage } from "@/src/utils/storage";
import { C, D } from "@/src/theme";

export type ThemeMode = "light" | "dark" | "system";

export function useTheme() {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    storage.getItem<ThemeMode>("azadi.theme", "light").then(setMode);
  }, []);

  const toggle = async (newMode: ThemeMode) => {
    setMode(newMode);
    await storage.setItem("azadi.theme", newMode);
  };

  const isDark = mode === "dark" || (mode === "system" && systemScheme === "dark");
  const colors = isDark ? D : C;

  return { colors, isDark, mode, toggle };
}
