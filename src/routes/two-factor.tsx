import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Shield, KeyRound } from "lucide-react";
import { verifyTwoFactorLogin } from "@/lib/security.functions";

export const Route = createFileRoute("/two-factor")({ component: TwoFactorPage });

function TwoFactorPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await verifyTwoFactorLogin({ data: { code: code.trim() } });
      sessionStorage.removeItem("mfa_pending");
      toast.success("驗證成功");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "驗證失敗");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    await supabase.auth.signOut();
    sessionStorage.removeItem("mfa_pending");
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md shadow-elegant">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Shield className="h-6 w-6" />
          </div>
          <CardTitle>二階段驗證</CardTitle>
          <CardDescription>
            {useBackup ? "請輸入 10 位備援碼（XXXXX-XXXXX）" : "請輸入驗證器 App 顯示的 6 位數驗證碼"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">驗證碼</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={useBackup ? "ABCDE-12345" : "123456"}
                autoComplete="one-time-code"
                inputMode={useBackup ? "text" : "numeric"}
                autoFocus
                required
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-gradient-primary">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              驗證
            </Button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => { setUseBackup((v) => !v); setCode(""); }}
                className="text-primary hover:underline flex items-center gap-1"
              >
                <KeyRound className="h-3 w-3" />
                {useBackup ? "改用驗證器" : "使用備援碼"}
              </button>
              <button type="button" onClick={cancel} className="text-muted-foreground hover:text-foreground">
                取消並登出
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
