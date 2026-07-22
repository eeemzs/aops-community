import { sveltekit } from "@sveltejs/kit/vite";
import { createLogger, defineConfig } from "vite";

const logger = createLogger();
const warn = logger.warn.bind(logger);
logger.warn = (message, options) => {
  if (message.includes("Unknown output options: codeSplitting")) return;
  warn(message, options);
};

export default defineConfig({
  cacheDir: ".vite",
  clearScreen: false,
  customLogger: logger,
  define: {
    __AOPS_SERVER_PACKAGE_VERSION__: JSON.stringify("0.1.5")
  },
  plugins: [sveltekit()],
  server: {
    host: "127.0.0.1",
    port: 5900,
    strictPort: true,
    cors: false
  },
  preview: {
    host: "127.0.0.1",
    port: 5900,
    strictPort: true,
    cors: false
  },
  build: {
    sourcemap: false
  }
});
