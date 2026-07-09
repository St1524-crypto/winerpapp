import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Mail } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "already" }
  | { kind: "ready" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  head: () => ({
    meta: [
      { title: "取消訂閱 — 源晶" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function UnsubscribePage() {
  const { token } = useSearch({ from: "/unsubscribe" });
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/email/unsubscribe?token=${encodeURIComponent(token)}`,
        );
        const data = await res.json();
        if (!res.ok || data.error) return setState({ kind: "invalid" });
        if (data.valid === false && data.reason === "already_unsubscribed")
          return setState({ kind: "already" });
        setState({ kind: "ready" });
      } catch {
        setState({ kind: "invalid" });
      }
    })();
  }, [token]);

  async function confirm() {
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success) return setState({ kind: "done" });
      if (data.reason === "already_unsubscribed")
        return setState({ kind: "already" });
      setState({ kind: "error", message: data.error || "取消訂閱失敗" });
    } catch (e: any) {
      setState({ kind: "error", message: e?.message || "網路錯誤" });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-muted/30">
      <Card className="max-w-md w-full">
        <CardContent className="pt-10 pb-8 text-center space-y-4">
          {state.kind === "loading" && (
            <>
              <Mail className="w-14 h-14 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">驗證中…</p>
            </>
          )}
          {state.kind === "ready" && (
            <>
              <Mail className="w-14 h-14 text-primary mx-auto" />
              <h1 className="text-xl font-bold">取消訂閱源晶郵件</h1>
              <p className="text-sm text-muted-foreground">
                確認後將不再收到來自源晶的行銷與通知郵件。
              </p>
              <Button onClick={confirm} size="lg" className="w-full">
                確認取消訂閱
              </Button>
            </>
          )}
          {state.kind === "submitting" && (
            <>
              <Mail className="w-14 h-14 text-muted-foreground mx-auto animate-pulse" />
              <p className="text-muted-foreground">處理中…</p>
            </>
          )}
          {state.kind === "done" && (
            <>
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
              <h1 className="text-xl font-bold">已成功取消訂閱</h1>
              <p className="text-sm text-muted-foreground">
                您將不再收到本站郵件，感謝您的支持。
              </p>
            </>
          )}
          {state.kind === "already" && (
            <>
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
              <h1 className="text-xl font-bold">您已取消訂閱</h1>
              <p className="text-sm text-muted-foreground">
                此 Email 先前已完成取消訂閱程序。
              </p>
            </>
          )}
          {state.kind === "invalid" && (
            <>
              <XCircle className="w-14 h-14 text-destructive mx-auto" />
              <h1 className="text-xl font-bold">連結無效</h1>
              <p className="text-sm text-muted-foreground">
                此取消訂閱連結已失效或不正確。
              </p>
            </>
          )}
          {state.kind === "error" && (
            <>
              <XCircle className="w-14 h-14 text-destructive mx-auto" />
              <h1 className="text-xl font-bold">操作失敗</h1>
              <p className="text-sm text-muted-foreground">{state.message}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
