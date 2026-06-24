import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { generateDailySummary } from "@/lib/operations.functions";
import { Sparkles, AlertTriangle, ClipboardList, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/operations/assistant")({
  component: AssistantPage,
});

function AssistantPage() {
  const fn = useServerFn(generateDailySummary);
  const { data } = useQuery({ queryKey: ["ops-ai-summary"], queryFn: () => fn({}) });

  if (!data) return <Card><CardContent className="py-6 text-muted-foreground">載入中…</CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI 行政助理 · 每日營運摘要 ({data.date})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm leading-relaxed bg-muted/40 rounded-md p-3">{data.summary_text}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox icon={<ClipboardList className="h-4 w-4" />} label="今日待辦" value={data.todo_count} />
            <StatBox icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="逾期任務" value={data.overdue_count} />
            <StatBox icon={<ClipboardList className="h-4 w-4" />} label="未回報" value={data.unreported_count} />
            <StatBox icon={<Clock className="h-4 w-4" />} label="打卡異常" value={data.attendance_anomaly_count} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>逾期任務</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.overdue_tasks.length === 0 && <p className="text-sm text-muted-foreground">無逾期</p>}
          {data.overdue_tasks.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between border rounded p-2 text-sm">
              <span>{t.title}</span>
              <Badge variant="destructive">{new Date(t.due_at).toLocaleString()}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>未回報任務</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.unreported_tasks.length === 0 && <p className="text-sm text-muted-foreground">無未回報</p>}
          {data.unreported_tasks.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between border rounded p-2 text-sm">
              <span>{t.title}</span>
              <Badge variant="secondary">{t.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">本摘要為規則式運算，尚未串接真實 AI API。後續可改為呼叫 Lovable AI Gateway 產生敘述式分析。</p>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
