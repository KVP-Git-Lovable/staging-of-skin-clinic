import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The last line of defence against a blank white screen.
 *
 * React 18 unmounts the entire tree when a render throws, and the app had no
 * boundary anywhere - so one bad row, one unexpected null, and a clinician was
 * left looking at nothing at all, mid-consultation, with no way forward but to
 * work out for themselves that the page needed reloading. That is part of what
 * was reported as the app refreshing or failing to load.
 *
 * This does not hide the fault: it says something went wrong, offers the two
 * things that actually help - try again without losing the session, or reload -
 * and logs the error where it can be found.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept as console.error to match how query and mutation failures are
    // already recorded in App.tsx - one place to look.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-amber-600 mx-auto" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">Something went wrong on this screen</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Nothing you had already saved is affected. Try this screen again, or reload the app.
            </p>
          </div>
          <p className="text-xs text-muted-foreground break-words">{this.state.error.message}</p>
          <div className="flex items-center justify-center gap-2">
            {/* Clearing the error re-renders the same tree: a transient fault
                recovers here without losing the signed-in session. */}
            <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload the app
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
