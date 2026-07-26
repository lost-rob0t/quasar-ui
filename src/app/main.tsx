import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import App from "../App.jsx";
import { QuasarProvider } from "../store.jsx";
import { registerServiceWorker } from "../lib/service-worker-registration.js";
import { initializeTheme } from "../lib/themes.js";
import { routerBasename } from "./base-path";
import "../styles.css";
import "../dashboard.css";
import "../mobile.css";
import "../mobile-editor.css";
import "../gesture-menu.css";
import "../graph-fullscreen.css";

initializeTheme();

function RouteClass() {
  const { pathname } = useLocation();

  useEffect(() => {
    const graphRoute = pathname === "/graph";
    document.documentElement.classList.toggle("graph-route", graphRoute);
    return () => document.documentElement.classList.remove("graph-route");
  }, [pathname]);

  return null;
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Quasar root element was not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename(import.meta.env.BASE_URL)}>
      <RouteClass />
      <QuasarProvider>
        <App />
      </QuasarProvider>
    </BrowserRouter>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => registerServiceWorker().catch(() => {}));
}
