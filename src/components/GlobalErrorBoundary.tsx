import { Component, ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, RotateCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[GlobalErrorBoundary]", error, info);
    try {
      toast.error("頁面發生錯誤", {
        description: error?.message ?? "未知錯誤，請重新嘗試。",
      });
    } catch {
      // toast may not be mounted yet
    }
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  handleHome = () => {
    this.setState({ error: null });
    if (typeof window !== "undefined") window.location.href = "/";
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold">頁面發生錯誤</h1>
            <p className="text-sm text-muted-foreground break-words">
              {this.state.error.message || "系統發生未預期錯誤，請重新嘗試或回到首頁。"}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={this.handleRetry} className="gap-2">
              <RotateCw className="h-4 w-4" /> 重新嘗試
            </Button>
            <Button variant="outline" onClick={this.handleHome} className="gap-2">
              <Home className="h-4 w-4" /> 回到首頁
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
