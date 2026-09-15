import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-ext-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-ext-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-ext-600.css";
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-ext-400.css";
import "@fontsource/cormorant-garamond/latin-400-italic.css";
import "@fontsource/cormorant-garamond/latin-ext-400-italic.css";
import Root from "./Root";
import { BrowserRouter } from "react-router-dom";
import "./shop.css";
import "./styles.css";
import "./home/art-direction.css";
import "./home/night-edition.css";
import "./prelaunch.css";

document.documentElement.classList.add("js");
const root = document.getElementById("root")!;
const app = (
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);
if (
  root.hasChildNodes() &&
  root.dataset.route === window.location.pathname &&
  !window.location.search
)
  ReactDOM.hydrateRoot(root, app);
else ReactDOM.createRoot(root).render(app);
