import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createHttpApi } from "./app/api";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("TinyMails could not find its application root.");

createRoot(root).render(
  <StrictMode>
    <App api={createHttpApi()} />
  </StrictMode>,
);
