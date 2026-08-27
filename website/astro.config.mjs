import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://llmdoc.tokenroll.ai",
  output: "static",
  trailingSlash: "always",
  integrations: [sitemap()],
});
