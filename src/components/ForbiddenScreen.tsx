import { useEffect } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { ShieldAlert, ArrowLeft, Home, Mail, KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@/lib/nav";
import type { AppRole } from "@/hooks/use-auth";

interface ForbiddenScreenProps {
  /** 該頁面所需的角色（任一即可） */
  requiredRoles: AppRole[];
  /** 頁面名稱，例如「系統設定」 */
  pageName?: string;
  /** 管理員聯絡信箱 */
  contactEmail?: string;
}

export function ForbiddenScreen({
  requiredRoles,
  pageName = "此頁面",
  contactEmail = "win889999@gmail.com",
}: ForbiddenScreenProps) {
  const { roles, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    toast.error("存取被拒絕", {
      description: `您沒有存取「${pageName}」的權限，需要：${requiredRoles
        .map((r) => ROLE_LABELS[r])
        .join(" / ")}`,
      duration: 5000,
    });
  }, [pageName, requiredRoles]);

  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(
    `[權限申請] ${pageName}`
  )}&body=${encodeURIComponent(
    `您好，\n\n我想申請存取「${pageName}」的權限。\n\n帳號：${user?.email ?? ""}\n目前角色：${
      roles.map((r) => ROLE_LABELS[r]).join("、") || "未指派"
    }\n需要角色：${requiredRoles.map((r) => ROLE_LABELS[r]).join("、")}\n\n申請原因：\n\n謝謝！`
  )}`;

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-xl bg-card/60 backdrop-blur border-border/60 overflow-hidden">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/10 via-transparent to-amber-500/10 pointer-events-none" />
          <CardContent className="relative p-8 md:p-10 space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 ring-1 ring-destructive/30 shrink-0">
                <ShieldAlert className="h-7 w-7 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <Badge
                  variant="outline"
                  className="border-destructive/40 text-destructive text-[10px] tracking-widest uppercase"
                >
                  403 · Forbidden
                </Badge>
                <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">
                  存取被拒絕
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  您目前的帳號權限不足以存取「
                  <span className="text-foreground font-medium">{pageName}</span>
                  」。
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <KeyRound className="h-3.5 w-3.5" /> 需具備角色
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {requiredRoles.map((r) => (
                    <Badge key={r} className="bg-primary/15 text-primary border-primary/30">
                      {ROLE_LABELS[r]}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <ShieldAlert className="h-3.5 w-3.5" /> 您目前角色
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {roles.length === 0 ? (
                    <Badge variant="secondary">未指派</Badge>
                  ) : (
                    roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <div className="font-medium text-amber-600 dark:text-amber-400">
                需要更高權限？
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                請聯絡系統管理員 <span className="font-mono">{contactEmail}</span>{" "}
                為您指派對應角色，指派完成後請重新登入以套用。
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => router.history.back()} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回上一頁
              </Button>
              <Link to="/dashboard">
                <Button variant="outline">
                  <Home className="h-4 w-4 mr-2" />
                  回儀表板
                </Button>
              </Link>
              <a href={mailto}>
                <Button className="bg-gradient-primary">
                  <Mail className="h-4 w-4 mr-2" />
                  聯絡管理員申請
                </Button>
              </a>
            </div>
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
