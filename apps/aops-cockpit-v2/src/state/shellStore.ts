import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ShellThemeDefinition } from "@aopslab/xf-ui-shell-react";

// Re-export the canonical xf-ui-shell theme shape ({ id, name, light, dark,
// variants, readonly }) so the store + theme-studio share the type that
// resolveShellAppearanceSnapshot expects.
export type { ShellThemeDefinition };

// --- M0 shell-state contract (aops-cockpit-v2 shell eops-desktop parity) ---
// Single source of truth for shell chrome state: appearance (theme/accent/
// theme-studio), navigation (collapsible navigator), section/page, locale, and
// selected project. Persisted to localStorage so the chrome survives reloads.
// Existing fields (activePageId/dockPinned/locale/selectedProjectKey) are kept
// so the current App.tsx keeps compiling; M1 migrates the frame onto navMode.

export type ThemeMode = "light" | "dark";
export type NavMode = "expanded" | "collapsed" | "hidden";
export type CockpitSection = "projects" | "pm" | "sessions";

export interface ShellState {
  // Appearance
  theme: ThemeMode;
  accentId: string;
  themeId: string;
  customThemes: ShellThemeDefinition[];
  // Navigation (collapsible navigator)
  navMode: NavMode;
  navAutoHide: boolean;
  // Sidebar hover popover (collapsed/hidden peek) — eops parity, persisted toggle
  navPopoverEnabled: boolean;
  // Section / page
  section: CockpitSection;
  activePageId: string;
  // Locale + scope
  locale: "en" | "tr";
  selectedProjectKey: string | null;
  // Legacy (current App.tsx); removed when M1 migrates to navMode
  dockPinned: boolean;

  // Appearance setters
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setAccentId: (accentId: string) => void;
  setThemeId: (themeId: string) => void;
  // Theme-studio setters (M2b/M2c)
  addCustomTheme: (theme: ShellThemeDefinition) => void;
  updateCustomTheme: (id: string, patch: Partial<ShellThemeDefinition>) => void;
  deleteCustomTheme: (id: string) => void;
  // Navigation setters
  setNavMode: (navMode: NavMode) => void;
  toggleNavAutoHide: () => void;
  setNavPopoverEnabled: (enabled: boolean) => void;
  toggleNavPopover: () => void;
  // Section / page setters
  setSection: (section: CockpitSection) => void;
  setActivePageId: (pageId: string) => void;
  // Locale + scope setters
  setLocale: (locale: "en" | "tr") => void;
  toggleLocale: () => void;
  setSelectedProjectKey: (projectKey: string | null) => void;
  // Legacy setter
  toggleDockPinned: () => void;
}

export const SHELL_STORE_KEY = "aops-cockpit-v2.shell.v1";

// Mirror xf-ui-shell DEFAULT_THEME_ID / DEFAULT_ACCENT_ID (main theme, first
// variant). The built-in "main" theme's variants are coral/amber/mint.
export const DEFAULT_SHELL_THEME_ID = "main";
export const DEFAULT_SHELL_ACCENT_ID = "coral";
export const DEFAULT_SHELL_THEME_MODE: ThemeMode = "light";

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      theme: DEFAULT_SHELL_THEME_MODE,
      accentId: DEFAULT_SHELL_ACCENT_ID,
      themeId: DEFAULT_SHELL_THEME_ID,
      customThemes: [],
      navMode: "expanded",
      navAutoHide: false,
      navPopoverEnabled: false,
      section: "projects",
      activePageId: "projects",
      locale: "tr",
      selectedProjectKey: null,
      dockPinned: true,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
      setAccentId: (accentId) => set({ accentId }),
      setThemeId: (themeId) => set({ themeId }),

      addCustomTheme: (theme) =>
        set((state) => ({ customThemes: [...state.customThemes.filter((t) => t.id !== theme.id), theme] })),
      updateCustomTheme: (id, patch) =>
        set((state) => ({
          customThemes: state.customThemes.map((t) => (t.id === id ? { ...t, ...patch, id: t.id } : t))
        })),
      deleteCustomTheme: (id) =>
        set((state) => ({
          customThemes: state.customThemes.filter((t) => t.id !== id),
          // fall back to default theme if the active one was deleted
          themeId: state.themeId === id ? DEFAULT_SHELL_THEME_ID : state.themeId
        })),

      setNavMode: (navMode) => set({ navMode }),
      toggleNavAutoHide: () => set((state) => ({ navAutoHide: !state.navAutoHide })),
      setNavPopoverEnabled: (enabled) => set({ navPopoverEnabled: enabled }),
      toggleNavPopover: () => set((state) => ({ navPopoverEnabled: !state.navPopoverEnabled })),

      setSection: (section) => set({ section }),
      setActivePageId: (pageId) => set({ activePageId: pageId }),

      setLocale: (locale) => set({ locale }),
      toggleLocale: () => set((state) => ({ locale: state.locale === "tr" ? "en" : "tr" })),
      setSelectedProjectKey: (projectKey) => set({ selectedProjectKey: projectKey }),

      toggleDockPinned: () => set((state) => ({ dockPinned: !state.dockPinned }))
    }),
    {
      name: SHELL_STORE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      // Persist only durable UI preferences (not transient selection).
      partialize: (state) => ({
        theme: state.theme,
        accentId: state.accentId,
        themeId: state.themeId,
        customThemes: state.customThemes,
        navMode: state.navMode,
        navAutoHide: state.navAutoHide,
        navPopoverEnabled: state.navPopoverEnabled,
        section: state.section,
        locale: state.locale
      })
    }
  )
);
