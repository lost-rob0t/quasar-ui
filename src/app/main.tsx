import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "../App.jsx";
import ActorConfigurationBridge from "../components/ActorConfigurationBridge.jsx";
import GraphContextRadialBridge from "../components/GraphContextRadialBridge.jsx";
import GraphObjectTypePickerBridge from "../components/GraphObjectTypePickerBridge.jsx";
import MelissaActorMigrationBridge from "../components/MelissaActorMigrationBridge.jsx";
import MobileGraphToolTray from "../components/MobileGraphToolTray.jsx";
import OperatorUiEnhancer from "../components/OperatorUiEnhancer.jsx";
import ProviderBrandIcons from "../components/ProviderBrandIcons.jsx";
import PwaInstallBridge from "../components/PwaInstallBridge.jsx";
import ReviewActorBridge from "../components/ReviewActorBridge.jsx";
import RunAllTransformationsBridge from "../components/RunAllTransformationsBridge.jsx";
import { QuasarProvider } from "../store.jsx";
import { registerServiceWorker } from "../lib/service-worker-registration.js";
import { initializeTheme } from "./base-path";
import { routerBasename } from "./base-path";
import "../styles.css";
import "../document-search.css";
import "../dashboard.css";
import "../dashboard-theme.css";
import "../mobile.css";
import "../mobile-editor.css";
import "../gesture-menu.css";
import "../operator-ui.css";
import "../dataset-menu.css";
import "../graph-fullscreen.css";
import "../mobile-graph-tools.css";
import "../mobile-graph-empty-state.css";
import "../graph-editors.css";
import "../graph-editors-extra.css";
import "../graph-workspace-shell.css";
import "../graph-full-viewport-modern.css";
import "../actor-configuration.css";
import "../agent-tab-icons.css";
import "../kinpaku-shell.css";

initializeTheme();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Quasar root element was not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename(import.meta.env.BASE_URL)}>
      <QuasarProvider>
        <App />
        <OperatorUiEnhancer />
        <ProviderBrandIcons />
        <PwaInstallBridge />
        <MelissaActorMigrationBridge />
        <ReviewActorBridge />
        <ActorConfigurationBridge />
        <RunAllTransformationsBridge />
        <MobileGraphToolTray />
        <GraphContextRadialBridge />
        <GraphObjectTypePickerBridge />
      </QuasarProvider>
    </BrowserRouter>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => registerServiceWorker().catch(() => {}));
}
