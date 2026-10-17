import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DownloadsPopover from "./DownloadsPopover";
import "./App.css";

const params = new URLSearchParams(window.location.search);
const isDownloadsWindow = params.get("nova-window") === "downloads";

if (isDownloadsWindow) {
  document.documentElement.classList.add("nova-popover-mode");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isDownloadsWindow ? <DownloadsPopover /> : <App />}
  </React.StrictMode>
);
