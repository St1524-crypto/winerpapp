import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  component: OperationsLayout,
});

const TABS = [
  { to: "/admin/operations", label: "總覽" },
  { to: "/admin/operations/members", label: "協作成員" },
  { to: "/admin/operations/tasks", label: "任務管理" },
  { to: "/admin/operations/attendance", label: "打卡紀錄" },
  { to: "/admin/operations/assistant", label: "AI 助理" },
];

function OperationsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isIndex = pathname === "/admin/operations";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.to} asChild variant={pathname === t.to ? "default" : "outline"} size="sm">
            <Link to={t.to}>{t.label}</Link>
          </Button>
        ))}
      </div>
      {isIndex ? <OperationsOverview /> : <Outlet />}
    </div>
  );
}

function OperationsOverview() {
  return (
    <Card>
      <CardHeader><CardTitle>營運協作中心</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>授權會員成為協作人員、建立 / 指派任務、查看員工打卡，並由 AI 行政助理彙整每日營運摘要。</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>協作成員：授權會員加入、設定角色（manager / staff / assistant）</li>
          <li>任務管理：建立、指派、追蹤狀態</li>
          <li>打卡紀錄：查看每日上下班打卡</li>
          <li>AI 助理：今日待辦、逾期、未回報、打卡異常摘要</li>
        </ul>
      </CardContent>
    </Card>
  );
}
