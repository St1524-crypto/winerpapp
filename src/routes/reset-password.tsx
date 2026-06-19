import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/reset-password")({ component: ResetPage });

function ResetPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("密碼已更新");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card/80 backdrop-blur-xl shadow-elegant p-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary mb-4">
          <KeyRound className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">重設密碼</h1>
        <p className="text-sm text-muted-foreground mb-6">請輸入新密碼</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pw">新密碼</Label>
            <Input id="pw" type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              顯示密碼
            </label>
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground">
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}更新密碼
          </Button>
        </form>
      </div>
    </div>
  );
}
