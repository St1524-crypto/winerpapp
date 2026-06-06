import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Loader2, Search, Users, Crown, Store, ChevronRight, ChevronDown, Network } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { getReferralTree, type TreeNode } from "@/lib/referral-tree.functions";

const ADMIN_ROLES: AppRole[] = ["super_admin", "admin", "finance", "sales"];

export const Route = createFileRoute("/_authenticated/admin/referral-tree")({
  head: () => ({
    meta: [{ title: "會員推薦組織圖 — 管理後台" }],
  }),
  component: Guard,
});

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ADMIN_ROLES.includes(r))) {
    return <ForbiddenScreen requiredRoles={ADMIN_ROLES} pageName="會員推薦組織圖" />;
  }
  return <ReferralTreePage />;
}

function ReferralTreePage() {
  const [root, setRoot] = useState("");
  const [depth, setDepth] = useState(3);
  const [result, setResult] = useState<any>(null);

  const fn = useServerFn(getReferralTree);
  const m = useMutation({
    mutationFn: (vars: { root: string; depth: number }) => fn({ data: vars }),
    onSuccess: (res) => {
      setResult(res);
      if (!(res as any).found) toast.error("查無此會員，請以推薦碼／會員編號／電話／Email 查詢");
    },
    onError: (e: any) => toast.error(e?.message ?? "查詢失敗"),
  });

  function onSearch() {
    if (!root.trim()) { toast.error("請輸入根會員識別"); return; }
    m.mutate({ root: root.trim(), depth });
  }

  return (
    <div className="space-y-6 p-2 md:p-4 max-w-[1600px] mx-auto">
      <Card className="bg-gradient-to-br from-primary/10 via-card/60 to-card/60 border-border/60">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <Network className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">會員推薦組織圖</h1>
            <p className="text-sm text-muted-foreground mt-1">以樹狀圖檢視會員推薦關係，可指定查詢代數（1～10 代）</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" />查詢條件</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px_auto] gap-4 items-end">
            <div className="space-y-1.5">
              <Label>根會員（推薦碼／會員編號／電話／Email）</Label>
              <Input
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder="例如 M000123、0912345678、user@example.com"
                onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>查詢代數</Label>
                <Badge variant="outline">{depth} 代</Badge>
              </div>
              <Slider value={[depth]} min={1} max={10} step={1} onValueChange={(v) => setDepth(v[0])} />
            </div>
            <Button onClick={onSearch} disabled={m.isPending} className="bg-gradient-primary">
              {m.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              查詢
            </Button>
          </div>
        </CardContent>
      </Card>

      {result?.found && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="下線總人數" value={result.stats.total_descendants} icon={Users} />
            <StatCard label="VIP 人數" value={result.stats.vip_count} icon={Crown} />
            <StatCard label="經銷商人數" value={result.stats.dealer_count} icon={Store} />
            <StatCard label="查詢代數" value={`${result.stats.max_depth} 代`} icon={Network} />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">推薦關係樹</CardTitle>
              <div className="flex gap-1 flex-wrap">
                {Object.entries(result.stats.by_level as Record<string, number>).map(([lv, n]) => (
                  <Badge key={lv} variant="secondary" className="text-[10px]">第 {lv} 代：{n} 人</Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <TreeView node={result.tree} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: any; icon: any }) {
  return (
    <Card className="bg-card/60 border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-primary/70" />
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function TreeView({ node }: { node: TreeNode }) {
  return (
    <div className="text-sm">
      <TreeNodeRow node={node} isRoot />
    </div>
  );
}

function TreeNodeRow({ node, isRoot = false }: { node: TreeNode; isRoot?: boolean }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div className={`flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 ${isRoot ? "bg-primary/5" : ""}`}>
        <button
          type="button"
          onClick={() => hasChildren && setOpen(!open)}
          className={`h-5 w-5 flex items-center justify-center rounded ${hasChildren ? "hover:bg-muted" : "opacity-30"}`}
        >
          {hasChildren ? (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />}
        </button>
        <Badge variant="outline" className="text-[10px] shrink-0">第 {node.depth} 代</Badge>
        <span className="font-medium truncate">{node.name || node.email || node.phone || "(未命名)"}</span>
        {node.member_no && <span className="text-xs text-muted-foreground">{node.member_no}</span>}
        {node.is_vip && <Badge className="text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30">VIP</Badge>}
        {node.is_dealer && <Badge className="text-[10px] bg-emerald-500/20 text-emerald-600 border-emerald-500/30">經銷</Badge>}
        {hasChildren && <Badge variant="secondary" className="text-[10px]">{node.children.length} 位下線</Badge>}
        <span className="ml-auto text-xs text-muted-foreground hidden md:inline">{node.phone || node.email || ""}</span>
      </div>
      {hasChildren && open && (
        <div className="ml-4 border-l border-border/60 pl-3 mt-1 space-y-0.5">
          {node.children.map((c) => <TreeNodeRow key={c.id} node={c} />)}
        </div>
      )}
    </div>
  );
}
