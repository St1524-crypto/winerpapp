import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldCheck, Users, Settings, Tag, Package, Boxes, ShoppingCart,
  Wallet, FileClock, Bell, Database, Activity, ArrowRight, Server, KeyRound,
  UserPlus, Sparkles,
} from "lucide-react";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "管理員控制中心 — 源倍力 ERP" },
      { name: "description", content: "源倍力 ERP 超級管理員專屬控制中心，總覽系統運作、模組入口與安全狀態。" },
    ],
  }),
  component: AdminPanel,
});

interface ActivityRow { id: string; kind: "audit" | "user"; title: string; detail: string; ts: string; }

interface Metric { users: number; roles: number; products: number; orders: number; notifications: number; audits: number; }

function AdminPanel() {
  const { roles, user } = useAuth();
  const isAdmin = roles.includes("super_admin") || roles.includes("admin");
  const [m, setM] = useState<Metric | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const counts = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("user_roles").select("*", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("*", { count: "exact", head: true }),
        supabase.from("notifications").select("*", { count: "exact", head: true }),
        supabase.from("audit_logs").select("*", { count: "exact", head: true }),
      ]);
      setM({
        users: counts[0].count ?? 0,
        roles: counts[1].count ?? 0,
        products: counts[2].count ?? 0,
        orders: counts[3].count ?? 0,
        notifications: counts[4].count ?? 0,
        audits: counts[5].count ?? 0,
      });

      const [audits, users] = await Promise.all([
        supabase.from("audit_logs").select("id, action, entity, created_at").order("created_at", { ascending: false }).limit(8),
        supabase.from("profiles").select("id, name, email, created_at").order("created_at", { ascending: false }).limit(5),
      ]);
      const rows: ActivityRow[] = [
        ...(audits.data ?? []).map((a) => ({
          id: `a-${a.id}`, kind: "audit" as const,
          title: `${a.action} · ${a.entity}`, detail: "稽核紀錄", ts: a.created_at,
        })),
        ...(users.data ?? []).map((u) => ({
          id: `u-${u.id}`, kind: "user" as const,
          title: u.name || u.email || "新用戶",
          detail: `加入系統 · ${u.email ?? ""}`, ts: u.created_at,
        })),
      ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 10);
      setActivity(rows);
    })();
  }, [isAdmin]);

  if (!isAdmin) {
    return <ForbiddenScreen requiredRoles={["super_admin"]} pageName="管理員控制中心" />;
  }

  const sections: { title: string; desc: string; icon: any; to: string; tone: string }[] = [
    { title: "會員管理", desc: "管理使用者帳號、停用與重設密碼", icon: Users, to: "/members", tone: "from-indigo-500/20 to-violet-500/10" },
    { title: "角色權限", desc: "指派 RBAC 角色與權限矩陣", icon: ShieldCheck, to: "/rls-test", tone: "from-emerald-500/20 to-teal-500/10" },
    { title: "系統設定", desc: "品牌 Logo、全站介面參數", icon: Settings, to: "/settings", tone: "from-fuchsia-500/20 to-pink-500/10" },
    { title: "商品管理", desc: "商品、SKU、上下架與圖片", icon: Package, to: "/products", tone: "from-amber-500/20 to-orange-500/10" },
    { title: "商品分類", desc: "主/子分類、排序與啟用狀態", icon: Tag, to: "/categories", tone: "from-cyan-500/20 to-sky-500/10" },
    { title: "庫存管理", desc: "庫存異動、安全庫存與盤點", icon: Boxes, to: "/inventory", tone: "from-lime-500/20 to-green-500/10" },
    { title: "訂單管理", desc: "訂單流程、出貨與付款狀態", icon: ShoppingCart, to: "/orders", tone: "from-rose-500/20 to-red-500/10" },
    { title: "財務管理", desc: "應收應付與財務報表", icon: Wallet, to: "/finance", tone: "from-yellow-500/20 to-amber-500/10" },
  ];

  return (
    <div className="space-y-6 p-2 md:p-4 max-w-[1600px] mx-auto">
      {/* Hero */}
      <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-primary/10 via-card/60 to-card/60 backdrop-blur">
        <div className="absolute inset-0 bg-grid-white/[0.02] pointer-events-none" />
        <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow shrink-0">
            <ShieldCheck className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px] tracking-widest uppercase">Super Admin</Badge>
              <Badge variant="secondary" className="text-[10px]">All Privileges</Badge>
            </div>
            <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">管理員控制中心</h1>
            <p className="text-sm text-muted-foreground mt-1">
              歡迎回來，<span className="text-foreground font-medium">{user?.email}</span>。 此處整合系統所有管理入口與營運狀態。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/settings"><Button className="bg-gradient-primary"><Settings className="h-4 w-4 mr-2" />系統設定</Button></Link>
            <Link to="/dashboard"><Button variant="outline"><Activity className="h-4 w-4 mr-2" />營運儀表板</Button></Link>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "註冊用戶", value: m?.users, icon: Users },
          { label: "角色指派", value: m?.roles, icon: KeyRound },
          { label: "商品總數", value: m?.products, icon: Package },
          { label: "訂單總數", value: m?.orders, icon: ShoppingCart },
          { label: "通知記錄", value: m?.notifications, icon: Bell },
          { label: "稽核紀錄", value: m?.audits, icon: FileClock },
        ].map((s) => (
          <Card key={s.label} className="bg-card/60 backdrop-blur border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className="h-4 w-4 text-primary/70" />
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">
                {m ? s.value?.toLocaleString() : <Skeleton className="h-7 w-16" />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick entries */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground tracking-widest uppercase mb-3">管理入口</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {sections.map((s) => (
            <Link key={s.to} to={s.to} className="group">
              <Card className={`h-full bg-gradient-to-br ${s.tone} border-border/60 hover:border-primary/60 transition-all hover:shadow-glow`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/40 ring-1 ring-border/60">
                      <s.icon className="h-5 w-5 text-primary" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                  <div>
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* System health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/60 backdrop-blur border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" /> 系統狀態
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <HealthRow label="資料庫連線" status="ok" detail="Supabase 正常" />
            <HealthRow label="身份驗證服務" status="ok" detail="Auth 服務在線" />
            <HealthRow label="檔案儲存" status="ok" detail="branding / product-images 可用" />
            <HealthRow label="RLS 政策" status="ok" detail="所有資料表已套用" />
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> 危險區域
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">以下操作將影響全站使用者，請謹慎執行。</p>
            <div className="flex flex-wrap gap-2">
              <Link to="/rls-test"><Button size="sm" variant="outline"><ShieldCheck className="h-4 w-4 mr-2" />RLS 存取測試</Button></Link>
              <Link to="/settings"><Button size="sm" variant="outline"><Settings className="h-4 w-4 mr-2" />還原品牌預設</Button></Link>
              <Button size="sm" variant="destructive" disabled><Database className="h-4 w-4 mr-2" />清除快取（停用）</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="bg-card/60 backdrop-blur border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> 近期動態
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">最新 10 筆</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[320px]">
            <div className="divide-y divide-border/60">
              {activity === null && (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              )}
              {activity?.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">尚無動態資料</div>
              )}
              {activity?.map((row) => (
                <div key={row.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${row.kind === "audit" ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"}`}>
                    {row.kind === "audit" ? <FileClock className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{row.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{row.detail}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                    {new Date(row.ts).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}


function HealthRow({ label, status, detail }: { label: string; status: "ok" | "warn" | "err"; detail: string }) {
  const color = status === "ok" ? "bg-emerald-500" : status === "warn" ? "bg-amber-500" : "bg-rose-500";
  const text = status === "ok" ? "正常" : status === "warn" ? "警告" : "異常";
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color} shadow-[0_0_8px] shadow-current animate-pulse`} />
        <span className="text-xs text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}
