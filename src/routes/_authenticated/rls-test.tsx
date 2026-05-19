import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ROLE_LABELS, NAV_ITEMS } from "@/lib/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, ShieldAlert, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rls-test")({ component: RlsTest });

const ROLES: AppRole[] = ["super_admin", "finance", "warehouse", "sales", "vendor", "member"];

type TableName = "products" | "orders" | "inventory_logs" | "profiles" | "user_roles";

const TESTS: { table: TableName; label: string; insert?: () => Record<string, unknown> }[] = [
  { table: "products", label: "商品", insert: () => ({ sku: `TEST-${Date.now()}`, name: "RLS測試商品", price: 1, stock: 0 }) },
  { table: "orders", label: "訂單", insert: () => ({ order_no: `T-${Date.now()}`, customer_name: "測試", total_amount: 0, status: "pending" }) },
  { table: "inventory_logs", label: "庫存紀錄", insert: () => ({ type: "in", quantity: 1 }) },
  { table: "profiles", label: "會員資料" },
  { table: "user_roles", label: "角色資料" },
];

type Result = { read: "ok" | "fail" | "pending"; write: "ok" | "fail" | "skip" | "pending"; readMsg?: string; writeMsg?: string; count?: number };

function Dot({ s }: { s: Result["read"] | Result["write"] }) {
  if (s === "pending") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (s === "skip") return <Eye className="h-4 w-4 text-muted-foreground" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

function RlsTest() {
  const { roles, user } = useAuth();
  const [simulated, setSimulated] = useState<AppRole | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState(false);

  const effectiveRoles = simulated ? [simulated] : roles;

  async function runTests() {
    setRunning(true);
    const next: Record<string, Result> = {};
    for (const t of TESTS) {
      next[t.table] = { read: "pending", write: "pending" };
      setResults({ ...next });

      const { data, error, count } = await supabase
        .from(t.table)
        .select("*", { count: "exact", head: false })
        .limit(1);
      next[t.table].read = error ? "fail" : "ok";
      next[t.table].readMsg = error?.message;
      next[t.table].count = count ?? data?.length ?? 0;

      if (!t.insert) {
        next[t.table].write = "skip";
      } else {
        const payload = t.insert();
        const { data: ins, error: wErr } = await supabase.from(t.table).insert(payload).select().maybeSingle();
        if (wErr) {
          next[t.table].write = "fail";
          next[t.table].writeMsg = wErr.message;
        } else {
          next[t.table].write = "ok";
          if (ins?.id) await supabase.from(t.table).delete().eq("id", ins.id);
        }
      }
      setResults({ ...next });
    }
    setRunning(false);
  }

  const visibleModules = NAV_ITEMS.filter(
    (i) => i.roles.length === 0 || i.roles.some((r) => effectiveRoles.includes(r)) || effectiveRoles.includes("super_admin"),
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">RLS 存取測試</h1>
        <p className="text-sm text-muted-foreground mt-1">
          切換假想角色預覽介面權限，並對資料庫即時執行讀寫測試以驗證 RLS 策略。
        </p>
      </div>

      <Card className="bg-card/60 backdrop-blur border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" /> 目前帳號
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Email：</span>{user?.email}
          </div>
          <div className="flex flex-wrap gap-2">
            {roles.length === 0 ? (
              <Badge variant="outline">未指派角色</Badge>
            ) : roles.map((r) => (
              <Badge key={r} className="bg-gradient-primary">{ROLE_LABELS[r]}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 backdrop-blur border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" /> 假想角色（僅影響介面預覽）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Toggle pressed={simulated === null} onPressedChange={() => setSimulated(null)} size="sm">
              使用真實角色
            </Toggle>
            {ROLES.map((r) => (
              <Toggle key={r} pressed={simulated === r} onPressedChange={() => setSimulated(r)} size="sm">
                {ROLE_LABELS[r]}
              </Toggle>
            ))}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2">該角色可見模組：</div>
            <div className="flex flex-wrap gap-2">
              {visibleModules.map((m) => (
                <Badge key={m.url} variant="secondary" className="gap-1">
                  <m.icon className="h-3 w-3" /> {m.title}
                </Badge>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            註：RLS 由資料庫以登入者真實 JWT 角色判斷，假想角色不會改變下方讀寫測試結果——這正可用來驗證實際權限是否與預期相符。
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card/60 backdrop-blur border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">資料表讀寫測試</CardTitle>
          <Button onClick={runTests} disabled={running} size="sm" className="bg-gradient-primary">
            {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />執行中</> : "開始測試"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border/60">
                  <th className="py-2 pr-4">資料表</th>
                  <th className="py-2 pr-4">讀取</th>
                  <th className="py-2 pr-4">寫入</th>
                  <th className="py-2 pr-4">筆數</th>
                  <th className="py-2">錯誤訊息</th>
                </tr>
              </thead>
              <tbody>
                {TESTS.map((t) => {
                  const r = results[t.table];
                  return (
                    <tr key={t.table} className="border-b border-border/30">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground font-mono">{t.table}</div>
                      </td>
                      <td className="py-3 pr-4"><Dot s={r?.read ?? "pending"} /></td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Dot s={r?.write ?? "pending"} />
                          {r?.write === "skip" && <span className="text-xs text-muted-foreground">僅讀</span>}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs">{r?.count ?? "—"}</td>
                      <td className="py-3 text-xs text-destructive max-w-md truncate">
                        {r?.readMsg || r?.writeMsg || ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
