import { useMemo } from "react";
import { resolveShellAppearanceSnapshot } from "@aopslab/xf-ui-shell-react";
import { useShellStore } from "./shellStore";

/**
 * Live shell appearance snapshot (built-in + custom themes) resolved from the
 * shell store. `snapshot.style` is spread into `AppShell.style` to apply the
 * theme tokens (--bg-0/--fg/--accent/...) as inline CSS vars; `themeOptions` /
 * `accentOptions` / `activeTheme` feed `ShellAppearanceControls` and the
 * ThemeStudio. Recomputes only when theme/themeId/accent/customThemes change.
 */
export function useShellAppearance() {
  const theme = useShellStore((state) => state.theme);
  const themeId = useShellStore((state) => state.themeId);
  const accentId = useShellStore((state) => state.accentId);
  const customThemes = useShellStore((state) => state.customThemes);
  return useMemo(
    () => resolveShellAppearanceSnapshot({ theme, themeId, accent: accentId, customThemes }),
    [theme, themeId, accentId, customThemes]
  );
}
