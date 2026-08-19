import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "../App.jsx";
import ActorConfigurationBridge from "../components/ActorConfigurationBridge.jsx";
import GraphContextRadialBridge from "../components/GraphContextRadialBridge.jsx";
import GraphObjectTypePickerBridge from "../components/GraphObjectTypePickerBridge.jsx";
import MelissaActorBridge from "../components/MelissaActorBridge.jsx";
import MobileGraphToolTray from "../components/MobileGraphToolTray.jsx";
import ProviderBrandIcons from "../components/ProviderBrandIcons.jsx";
import PwaInstallBridge from "../components/PwaInstallBridge.jsx";
import ReviewActorBridge from "../components/ReviewActorBridge.jsx";
import RunAllTransformationsBridge from "../components/RunAllTransformationsBridge.jsx";
import { QuasarProvider } from "../store.jsx";
import { registerServiceWorker } from "../lib/service-worker-registration.js";
import { initializeTheme } from "../lib/themes.js";
import { routerBasename } from "./base-path";
import { standaloneAdapter } from "../ui-core/adapters";
import { UiRuntimeProvider } from "../ui-core/runtime";
import "../styles.css";
import "../document-search.css";
import "../dashboard.css";
import "../dashboard-theme.css";
import "../mobile.css";
import "../mobile-editor.css";
import "../gesture-menu.css";
import "../operator-ui.css";
import "../dataset-menu.css";
import "../mobile-graph-tools.css";
import "../mobile-graph-empty-state.css";
import "../graph-editors.css";
import "../graph-editors-extra.css";
import "../melissa-actors.css";
import "../actor-configuration.css";
import "../agent-tab-icons.css";
import "../kinpaku-shell.css";
import "../ui-core/shell.css";
import "../ui-core/surfaces.css";
import "../ui-core/graph.css";
import "../ui-core/responsive.css";

initializeTheme();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Quasar root element was not found");

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename(import.meta.env.BASE_URL)}>
      <UiRuntimeProvider adapter={standaloneAdapter}>
        <QuasarProvider>
          <App />
          <ProviderBrandIcons />
          <PwaInstallBridge />
          <MelissaActorBridge />
          <ReviewActorBridge />
          <ActorConfigurationBridge />
          <RunAllTransformationsBridge />
          <MobileGraphToolTray />
          <GraphContextRadialBridge />
          <GraphObjectTypePickerBridge />
        </QuasarProvider>
      </UiRuntimeProvider>
    </BrowserRouter>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => registerServiceWorker().catch(() => {}));
}
