import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "../App.jsx";
import MobileGraphToolTray from "../components/MobileGraphToolTray.jsx";
import OperatorUiEnhancer from "../components/OperatorUiEnhancer.jsx";
import { QuasarProvider } from "../store.jsx";
import { registerServiceWorker } from "../lib/service-worker-registration.js";
import { initializeTheme } from "../lib/themes.js";
import { routerBasename } from "./base-path";
import "../styles.css";
import "../dashboard.css";
import "../dashboard-theme.css";
import "../mobile.css";
import "../mobile-editor.css";
import "../gesture-menu.css";
import "../operator-ui.css";
import "../graph-fullscreen.css";
import "../mobile-graph-tools.css";
import "../mobile-graph-empty-state.css";

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
        <MobileGraphToolTray />
      </QuasarProvider>
    </BrowserRouter>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => registerServiceWorker().catch(() => {}));
}
