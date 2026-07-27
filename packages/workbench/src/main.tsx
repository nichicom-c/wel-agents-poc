import { createRoot } from "react-dom/client";

import { App } from "./app/App.tsx";
import "./app/styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found.");
}

createRoot(root).render(<App />);
