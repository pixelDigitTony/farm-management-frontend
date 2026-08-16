import { Icon } from "@iconify/react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/button";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render error", error, info);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-blush-50 p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-red-100 text-red-700">
            <Icon icon="solar:danger-circle-linear" className="size-8" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-semibold">
            The screen couldn’t be displayed
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">
            Your saved data was not changed. Reload the app to try again.
          </p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            <Icon icon="solar:refresh-linear" />
            Reload application
          </Button>
        </div>
      </main>
    );
  }
}
