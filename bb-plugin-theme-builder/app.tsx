import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { BuilderPage } from "./src/editor/BuilderPage.tsx";

const PANEL = {
  id: "builder",
  title: "Theme Builder",
  icon: "Palette",
  path: "builder",
};

export default definePluginApp((app) => {
  app.slots.navPanel({ ...PANEL, component: BuilderPage });
});
