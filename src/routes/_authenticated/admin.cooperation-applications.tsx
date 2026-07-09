import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listCooperationApplications,
  updateCooperationApplication,
} from "@/lib/cooperation.functions";
import { useAuth } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/cooperation-applications")({
  component: AdminCooperationPage,
});

const TYPE_LABEL: Record<string, string> = {
  dealer: "經銷商",
  reseller: "個人代銷",
  vip: "VIP",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "待處理",
  contacted: "已聯繫",
  approved: "已通過",
  rejected: "已拒絕",
  archived: "已封存",
};

function AdminCooperationPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");

  if (!isAdmin) return <ForbiddenScreen />;

  const qc = useQueryClient();
  const list = useServerFn(listCooperationApplications);
  const update = useServerFn(updateCooperationApplication);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cooperation-applications", typeFilter, statusFilter],
    queryFn: () =>
      list({
        data: {
          type: typeFilter === "all" ? null : (typeFilter as any),
          status: statusFilter === "all" ? null : (statusFilter as any),
        },
      }),
  });

  const rows = data ?? [];

  const mut = useMutation({
    mutationFn: (v: { id: string; status?: string; admin_note?: string | null }) =>
      update({ data: v as any }),
    onSuccess: () => {
      toast.success("已更新");
      qc.invalidateQueries({ queryKey: ["cooperation-applications"] });
      setSelected(null);
    },
    onError: (e: any) => toast.error(e?.message || "更新失敗"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>合作申請管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="w-40">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue placeholder="類型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部類型</SelectItem>
                  <SelectItem value="dealer">經銷商</SelectItem>
                  <SelectItem value="reseller">個人代銷</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="狀態" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部狀態</SelectItem>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>時間</TableHead>
                  <TableHead>類型</TableHead>
                  <TableHead>姓名 / 公司</TableHead>
                  <TableHead>電話</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6">載入中…</TableCell></TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">尚無資料</TableCell></TableRow>
                )}
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABEL[r.application_type]}</Badge></TableCell>
                    <TableCell>{r.company_name || r.contact_name || r.owner_name || "-"}</TableCell>
                    <TableCell>{r.phone}</TableCell>
                    <TableCell className="text-xs">{r.email}</TableCell>
                    <TableCell><Badge>{STATUS_LABEL[r.status]}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setSelected(r)}>詳情</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <DetailDialog
        row={selected}
        onClose={() => setSelected(null)}
        onSave={(patch) => mut.mutate({ id: selected.id, ...patch })}
        saving={mut.isPending}
      />
    </div>
  );
}

function DetailDialog({
  row,
  onClose,
  onSave,
  saving,
}: {
  row: any | null;
  onClose: () => void;
  onSave: (p: { status?: string; admin_note?: string | null }) => void;
  saving: boolean;
}) {
  const [status, setStatus] = useState<string>("");
  const [note, setNote] = useState<string>("");

  useMemo(() => {
    if (row) {
      setStatus(row.status);
      setNote(row.admin_note ?? "");
    }
  }, [row?.id]);

  if (!row) return null;

  const rows: [string, any][] = [
    ["申請類型", TYPE_LABEL[row.application_type]],
    ["公司名稱", row.company_name],
    ["統一編號", row.tax_id],
    ["負責人", row.owner_name],
    ["聯絡人 / 姓名", row.contact_name],
    ["電話", row.phone],
    ["Email", row.email],
    ["LINE ID", row.line_id],
    ["縣市", row.city],
    ["地址", row.address],
    ["銷售平台/通路", (row.sales_channels ?? []).join("、")],
    ["平台連結", row.sales_platform_url],
    ["粉絲/銷售量", row.audience_size],
    ["想合作/代銷產品", row.interested_products],
    ["預估月銷量", row.expected_monthly_volume],
    ["已有推薦人", row.has_referrer == null ? "" : row.has_referrer ? "是" : "否"],
    ["推薦人資訊", row.referrer_info],
    ["想了解項目", (row.interested_topics ?? []).join("、")],
    ["備註", row.note],
  ];

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>申請詳情</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {rows.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
            <div key={k} className="grid grid-cols-3 gap-2 border-b py-1.5">
              <div className="text-muted-foreground">{k}</div>
              <div className="col-span-2 whitespace-pre-wrap">{String(v)}</div>
            </div>
          ))}
          <div className="pt-4 space-y-2">
            <div>
              <label className="text-sm font-medium">狀態</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">管理員備註</label>
              <Textarea className="mt-1" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onSave({ status: "archived", admin_note: note })}
            disabled={saving}
          >
            封存
          </Button>
          <Button onClick={() => onSave({ status, admin_note: note })} disabled={saving}>
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
