import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/unbounded/600.css";
import "@aopslab/xf-ui-foundation/styles.css";
import "@aopslab/xf-ui-shell-react/styles.css";
import "@aopslab/xf-ui-shell-react/styles/reference-shell.css";
import "@aopslab/xf-ui-composition-react/styles/navigator.css";
import "./styles/app.css";
import { App } from "./App";
import { aopsCockpitQueryClient } from "./lib/queryClient";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("aops_cockpit_v2_root_missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={aopsCockpitQueryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
