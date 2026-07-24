import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ClipboardList,
  X,
  Minus,
  Loader2,
  RefreshCw,
  Send,
  CheckCircle2,
  PlayCircle,
  Search,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useAdminFabsHidden } from "@/hooks/use-admin-fabs";
import {
  listTasks,
  updateTaskStatus,
  submitTaskReport,
} from "@/lib/operations.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type FilterKey = "today" | "overdue" | "pending" | "completed" | "all";
type SortKey = "due_asc" | "due_desc" | "priority" | "created_desc";
type ScopeKey = "mine" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "overdue", label: "逾期" },
  { key: "pending", label: "待處理" },
  { key: "completed", label: "已完成" },
  { key: "all", label: "全部" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "due_asc", label: "到期最近" },
  { key: "due_desc", label: "到期最遠" },
  { key: "priority", label: "優先度" },
  { key: "created_desc", label: "最新建立" },
];

const PRIORITY_WEIGHT: Record<Task["priority"], number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "submitted" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  due_at: string | null;
  assignee_id: string | null;
  created_at?: string | null;
  department?: string | null;
};

const STATUS_LABEL: Record<Task["status"], string> = {
  pending: "待處理",
  in_progress: "進行中",
  submitted: "已回報",
  completed: "已完成",
  cancelled: "已取消",
};

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  low: "低",
  normal: "一般",
  high: "高",
  urgent: "緊急",
};


export function AdminTaskHelperWidget() {
  const { user, roles } = useAuth();
  const isStaff = roles.length > 0;
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("today");
  const [sort, setSort] = useState<SortKey>("due_asc");
  const [scope, setScope] = useState<ScopeKey>("mine");
  const [keyword, setKeyword] = useState("");
  const hidden = useAdminFabsHidden();

  const list = useServerFn(listTasks);
  const updateStatus = useServerFn(updateTaskStatus);
  const submitReport = useServerFn(submitTaskReport);

  async function refresh() {
    if (!user) return;
    setLoading(true);
    try {
      const rows = (await list({ data: { scope } })) as Task[];
      setTasks(rows);
    } catch {
      toast.error("無法載入任務清單");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);

  const counts = useMemo(() => {
    const now = Date.now();
    let today = 0;
    let overdue = 0;
    let pending = 0;
    let completed = 0;
    for (const t of tasks) {
      const active = t.status === "pending" || t.status === "in_progress";
      if (active) pending += 1;
      if (t.status === "completed") completed += 1;
      if (active && t.due_at) {
        const due = new Date(t.due_at).getTime();
        if (due < now) overdue += 1;
        else if (new Date(t.due_at).toDateString() === new Date().toDateString()) today += 1;
      } else if (active && !t.due_at) {
        today += 1;
      }
    }
    return { today, overdue, pending, completed, all: tasks.length };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const now = Date.now();
    const kw = keyword.trim().toLowerCase();
    const active = (t: Task) => t.status === "pending" || t.status === "in_progress";
    let rows = tasks.filter((t) => {
      switch (filter) {
        case "today":
          if (!active(t)) return false;
          if (!t.due_at) return true;
          return new Date(t.due_at).toDateString() === new Date().toDateString();
        case "overdue":
          return active(t) && !!t.due_at && new Date(t.due_at).getTime() < now;
        case "pending":
          return active(t);
        case "completed":
          return t.status === "completed";
        case "all":
        default:
          return t.status !== "cancelled";
      }
    });
    if (kw) {
      rows = rows.filter(
        (t) =>
          t.title.toLowerCase().includes(kw) ||
          (t.description ?? "").toLowerCase().includes(kw) ||
          (t.department ?? "").toLowerCase().includes(kw),
      );
    }
    const dueVal = (t: Task) =>
      t.due_at ? new Date(t.due_at).getTime() : Number.POSITIVE_INFINITY;
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "due_desc":
          return dueVal(b) - dueVal(a);
        case "priority":
          return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        case "created_desc":
          return (
            new Date(b.created_at ?? 0).getTime() -
            new Date(a.created_at ?? 0).getTime()
          );
        case "due_asc":
        default:
          return dueVal(a) - dueVal(b);
      }
    });
    return rows;
  }, [tasks, filter, sort, keyword]);

  async function handleQuickStatus(
    id: string,
    status: "in_progress" | "completed",
  ) {
    setBusyId(id);
    try {
      await updateStatus({ data: { id, status } });
      toast.success(status === "completed" ? "已標記完成" : "已開始進行");
      refresh();
    } catch {
      toast.error("更新失敗");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmitReport(id: string) {
    const text = reportText.trim();
    if (!text) return;
    setBusyId(id);
    try {
      await submitReport({
        data: {
          taskId: id,
          content: text,
          statusSnapshot: "submitted",
        },
      });
      toast.success("進度已回報");
      setReportText("");
      setReportingId(null);
      refresh();
    } catch {
      toast.error("回報失敗");
    } finally {
      setBusyId(null);
    }
  }

  if (!isStaff) return null;
  if (hidden && !open) return null;

  const unreadCount = counts.today + counts.overdue;

  return (
    <div className="fixed bottom-2 right-2 md:bottom-3 md:right-3 z-40 print:hidden">
      {!open && (
        <button
          type="button"
          aria-label="任務小幫手"
          title="任務小幫手"
          onClick={() => setOpen(true)}
          className="relative flex items-center justify-center rounded-full bg-emerald-500/90 hover:bg-emerald-500 text-white shadow-md hover:scale-105 active:scale-95 transition h-8 w-8 md:h-9 md:w-9"
        >
          <ClipboardList className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[16px] font-semibold">
              {unreadCount}
            </span>
          )}
          <span className="sr-only">任務小幫手</span>
        </button>
      )}

      {open && (
        <div className="w-[min(400px,calc(100vw-1rem))] h-[600px] max-h-[calc(100vh-2rem)] flex flex-col rounded-xl border bg-card text-card-foreground shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-emerald-600" />
              任務小幫手
              {counts.overdue > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  逾期 {counts.overdue}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={refresh}
                disabled={loading}
                aria-label="重新整理"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setOpen(false)}
                aria-label="收合"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setOpen(false)}
                aria-label="關閉"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="px-3 py-2 border-b bg-background/40 space-y-2">
            <div className="flex items-center gap-1">
              {(["mine", "all"] as ScopeKey[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    "px-2 py-0.5 rounded-md border text-[11px] transition",
                    scope === s
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background hover:bg-muted text-muted-foreground",
                  )}
                >
                  {s === "mine" ? "我的任務" : "全部任務"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => {
                const n =
                  f.key === "today"
                    ? counts.today
                    : f.key === "overdue"
                    ? counts.overdue
                    : f.key === "pending"
                    ? counts.pending
                    : f.key === "completed"
                    ? counts.completed
                    : counts.all;
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "px-2 py-0.5 rounded-full border text-[11px] transition",
                      active
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-background hover:bg-muted text-muted-foreground",
                    )}
                  >
                    {f.label}
                    <span className="ml-1 opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜尋任務標題／說明／部門"
                  className="w-full h-7 pl-7 pr-2 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="relative">
                <ArrowUpDown className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-7 pl-7 pr-2 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  aria-label="排序方式"
                >
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 text-sm">
            {loading && tasks.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> 載入中…
              </div>
            ) : (
              <Section
                title={`${FILTERS.find((f) => f.key === filter)?.label ?? ""}任務`}
                items={filteredTasks}
                emptyText={
                  keyword
                    ? "查無符合關鍵字的任務。"
                    : "此分類目前沒有任務。"
                }
                busyId={busyId}
                reportingId={reportingId}
                reportText={reportText}
                setReportText={setReportText}
                setReportingId={setReportingId}
                onStatus={handleQuickStatus}
                onSubmitReport={handleSubmitReport}
              />
            )}
          </div>

          <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
            {scope === "mine" ? "只顯示指派給您的任務" : "顯示全部任務清單"}；可直接更新狀態或回報進度。
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  emptyText,
  busyId,
  reportingId,
  reportText,
  setReportText,
  setReportingId,
  onStatus,
  onSubmitReport,
  muted = false,
}: {
  title: string;
  items: Task[];
  emptyText?: string;
  busyId: string | null;
  reportingId: string | null;
  reportText: string;
  setReportText: (s: string) => void;
  setReportingId: (s: string | null) => void;
  onStatus: (id: string, status: "in_progress" | "completed") => void;
  onSubmitReport: (id: string) => void;
  muted?: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          "text-xs font-semibold mb-2",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {items.map((t) => {
            const busy = busyId === t.id;
            const reporting = reportingId === t.id;
            return (
              <div
                key={t.id}
                className="rounded-md border bg-background/60 p-2.5 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">
                      {t.title}
                    </div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {t.description}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {STATUS_LABEL[t.status]}
                      </Badge>
                      <Badge
                        variant={
                          t.priority === "urgent" || t.priority === "high"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {PRIORITY_LABEL[t.priority]}
                      </Badge>
                      {t.due_at && (
                        <span className="text-[10px] text-muted-foreground">
                          到期 {new Date(t.due_at).toLocaleString("zh-TW", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {t.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => onStatus(t.id, "in_progress")}
                    >
                      <PlayCircle className="h-3.5 w-3.5 mr-1" />
                      開始
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() =>
                      setReportingId(reporting ? null : t.id)
                    }
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    {reporting ? "取消回報" : "回報進度"}
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => onStatus(t.id, "completed")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    完成
                  </Button>
                </div>

                {reporting && (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      rows={2}
                      placeholder="輸入本次進度說明…"
                      className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      disabled={busy}
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={busy}
                        onClick={() => {
                          setReportingId(null);
                          setReportText("");
                        }}
                      >
                        取消
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={busy || !reportText.trim()}
                        onClick={() => onSubmitReport(t.id)}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "送出回報"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
