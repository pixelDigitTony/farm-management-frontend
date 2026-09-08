import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { App } from "./App";
import { bindSessionCache, createQueryClient } from "./api/query-client";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./styles.css";

const queryClient = createQueryClient();
const unbindSessionCache = bindSessionCache(queryClient);
if (import.meta.hot) import.meta.hot.dispose(unbindSessionCache);
const root = document.getElementById("root");
if (!root) throw new Error("Root element was not found");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <BrowserRouter>
          <App />
          <Toaster richColors position="top-right" closeButton />
        </BrowserRouter>
      </AppErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);
