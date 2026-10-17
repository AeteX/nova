import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Browser from "./components/Browser";
import "./App.css";

function App() {
  useEffect(() => {
    invoke("load_bundled_easylist")
      .then((count) => console.log(`[adblock] loaded ${count} rules`))
      .catch((err) => console.error("[adblock] load failed:", err));
  }, []);

  return <Browser />;
}

export default App;