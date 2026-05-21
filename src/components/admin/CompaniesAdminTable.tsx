import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Building2, Loader2, Plus, Trash2, Search, CheckCircle2, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { companySchema } from "@/lib/company-schema";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type CompanyRow = {
  id: string;
  company_name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
};

type FieldKey = "company_name" | "tax_id" | "email" | "phone" | "address";

const FIELD_LABEL: Record<FieldKey, string> = {
  company_name: "公司名稱",
  tax_id: "統一編號",
  email: "Email",
  phone: "電話",
  address: "地址",
};

function validateField(field: FieldKey, value: string): string | null {
  const shape: any = {
    company_name: companySchema.shape.company_name,
    tax_id: companySchema.shape.tax_id,
    email: companySchema.shape.email,
    phone: companySchema.shape.phone,
    address: companySchema.shape.address,
  }[field];
  const r = shape.safeParse(value);
  return r.success ? null : r.error.issues[0]?.message ?? "格式錯誤";
}

export function CompaniesAdminTable() {
  const qc = useQueryClient();
  const { refresh, currentCompanyId } = useCurrentCompany();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [errorCell, setErrorCell] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  async function logAudit(action: string, row: Pick<CompanyRow, "id" | "company_name">, metadata: Record<string, any>) {
    if (!user) return;
    try {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action,
        entity: "companies",
        entity_id: row.id,
        metadata: {
          company_name: row.company_name,
          occurred_at: new Date().toISOString(),
          ...metadata,
        },
      });
      qc.invalidateQueries({ queryKey: ["company-audit-history"] });
    } catch (e) {
      console.warn("[audit] company log failed:", e);
    }
  }

  const q = useQuery({
    queryKey: ["admin-companies-table"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name, tax_id, email, phone, address, status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  const filtered = useMemo(() => {
    const list = q.data ?? [];
    const kw = query.trim().toLowerCase();
    if (!kw) return list;
    return list.filter((c) =>
      [c.company_name, c.tax_id, c.email, c.phone, c.address]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw)),
    );
  }, [q.data, query]);

  async function saveField(row: CompanyRow, field: FieldKey, raw: string) {
    const value = raw.trim();
    const original = (row[field] ?? "") as string;
    if (value === original) return;

    const cellKey = `${row.id}:${field}`;
    const err = validateField(field, value);
    if (err) {
      setErrorCell((s) => ({ ...s, [cellKey]: err }));
      toast.error(`${FIELD_LABEL[field]} 格式錯誤`, { description: err });
      return;
    }
    // duplicate pre-check for tax_id / email
    if ((field === "tax_id" && value) || (field === "email" && value)) {
      const col = field;
      const target = field === "email" ? value.toLowerCase() : value;
      const { data: dup } = await supabase
        .from("companies").select("id").neq("id", row.id)
        .ilike(col, target).limit(1);
      if (dup && dup.length > 0) {
        const msg = field === "tax_id" ? "此統一編號已被其他公司使用" : "此 Email 已被其他公司使用";
        setErrorCell((s) => ({ ...s, [cellKey]: msg }));
        toast.error("重複資料", { description: msg });
        return;
      }
    }

    setSavingCell(cellKey);
    setErrorCell((s) => { const n = { ...s }; delete n[cellKey]; return n; });
    const payload: any = { [field]: value === "" ? null : (field === "email" ? value.toLowerCase() : value) };
    const { error } = await supabase.from("companies").update(payload).eq("id", row.id);
    setSavingCell(null);

    if (error) {
      const msg = error.code === "23505"
        ? (field === "tax_id" ? "此統一編號已被其他公司使用" : field === "email" ? "此 Email 已被其他公司使用" : error.message)
        : error.message;
      setErrorCell((s) => ({ ...s, [cellKey]: msg }));
      toast.error(`儲存失敗：${FIELD_LABEL[field]}`, { description: msg });
      return;
    }
    toast.success(`已更新 ${FIELD_LABEL[field]}`);
    await logAudit("company.update_field", row, {
      field,
      field_label: FIELD_LABEL[field],
      old_value: original || null,
      new_value: value || null,
    });
    qc.invalidateQueries({ queryKey: ["admin-companies-table"] });
    qc.invalidateQueries({ queryKey: ["settings-current-company"] });
    refresh();
  }

  const statusMut = useMutation({
    mutationFn: async ({ row, next }: { row: CompanyRow; next: "active" | "inactive" }) => {
      const { error } = await supabase.from("companies").update({ status: next }).eq("id", row.id);
      if (error) throw error;
      return { row, next };
    },
    onSuccess: async ({ row, next }) => {
      toast.success(next === "active" ? "已啟用公司" : "已停用公司");
      await logAudit(next === "active" ? "company.activate" : "company.deactivate", row, {
        old_status: row.status, new_status: next,
      });
      qc.invalidateQueries({ queryKey: ["admin-companies-table"] });
      refresh();
    },
    onError: (e: any) => toast.error("狀態更新失敗", { description: e?.message ?? "未知錯誤" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (row: CompanyRow) => {
      const { error } = await supabase.from("companies").delete().eq("id", row.id);
      if (error) throw error;
      return row;
    },
    onSuccess: async (row) => {
      toast.success("已刪除公司");
      await logAudit("company.delete", row, {
        snapshot: {
          tax_id: row.tax_id, email: row.email, phone: row.phone, address: row.address, status: row.status,
        },
      });
      qc.invalidateQueries({ queryKey: ["admin-companies-table"] });
      refresh();
    },
    onError: (e: any) => toast.error("刪除失敗", { description: e?.message ?? "未知錯誤" }),
  });

  async function createCompany() {
    const name = newName.trim();
    const err = validateField("company_name", name);
    if (err) { toast.error("無法新增", { description: err }); return; }
    setAdding(true);
    const { data, error } = await supabase
      .from("companies")
      .insert({ company_name: name, status: "active" })
      .select("id, company_name")
      .single();
    setAdding(false);
    if (error) {
      toast.error("新增失敗", { description: error.message });
      return;
    }
    toast.success("已新增公司");
    if (data) await logAudit("company.create", data as any, { initial_status: "active" });
    setNewName("");
    qc.invalidateQueries({ queryKey: ["admin-companies-table"] });
    refresh();
  }

  return (
    <Card className="bg-card/60 backdrop-blur border-border/60">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> 公司清單
          {q.data && <Badge variant="outline" className="ml-1 text-xs">{q.data.length}</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋公司"
              className="h-9 pl-7 w-full sm:w-[200px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="新公司名稱"
              className="h-9 w-[160px]"
              onKeyDown={(e) => { if (e.key === "Enter") createCompany(); }}
            />
            <Button size="sm" onClick={createCompany} disabled={adding || !newName.trim()} className="bg-gradient-primary">
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span className="ml-1 hidden sm:inline">新增</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : q.isError ? (
          <div className="py-10 text-center text-sm text-destructive">載入失敗：{(q.error as any)?.message ?? "未知錯誤"}</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">沒有符合的公司</div>
        ) : (
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">公司名稱</TableHead>
                  <TableHead className="min-w-[120px]">統一編號</TableHead>
                  <TableHead className="min-w-[200px]">Email</TableHead>
                  <TableHead className="min-w-[130px]">電話</TableHead>
                  <TableHead className="min-w-[220px]">地址</TableHead>
                  <TableHead className="min-w-[120px]">狀態</TableHead>
                  <TableHead className="w-[60px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} className={row.id === currentCompanyId ? "bg-primary/5" : ""}>
                    {(["company_name", "tax_id", "email", "phone", "address"] as FieldKey[]).map((field) => {
                      const cellKey = `${row.id}:${field}`;
                      const err = errorCell[cellKey];
                      const saving = savingCell === cellKey;
                      return (
                        <TableCell key={field} className="align-top">
                          <div className="relative">
                            <Input
                              defaultValue={row[field] ?? ""}
                              key={`${cellKey}:${row[field] ?? ""}`}
                              disabled={saving}
                              onBlur={(e) => saveField(row, field, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") {
                                  (e.target as HTMLInputElement).value = (row[field] ?? "") as string;
                                  (e.target as HTMLInputElement).blur();
                                  setErrorCell((s) => { const n = { ...s }; delete n[cellKey]; return n; });
                                }
                              }}
                              className={`h-8 ${err ? "border-destructive focus-visible:ring-destructive" : ""}`}
                            />
                            {saving && (
                              <Loader2 className="h-3 w-3 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            )}
                            {err && <p className="mt-1 text-[10px] text-destructive">{err}</p>}
                          </div>
                        </TableCell>
                      );
                    })}
                    <TableCell className="align-top">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={row.status === "active"}
                          disabled={statusMut.isPending}
                          onCheckedChange={(c) => statusMut.mutate({ row, next: c ? "active" : "inactive" })}
                          aria-label="切換啟用"
                        />
                        <Badge variant="outline" className={
                          row.status === "active"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-muted text-muted-foreground"
                        }>
                          {row.status === "active" ? "啟用" : "停用"}
                        </Badge>
                        {row.id === currentCompanyId && (
                          <span title="目前公司" className="inline-flex">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="刪除">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>刪除「{row.company_name}」？</AlertDialogTitle>
                            <AlertDialogDescription>
                              此操作無法復原。若此公司已有關聯資料（客戶、訂單等），刪除可能會失敗。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMut.mutate(row)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              確認刪除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          提示：點選欄位後直接編輯，<kbd className="px-1 rounded bg-muted">Enter</kbd> 或失焦即儲存，<kbd className="px-1 rounded bg-muted">Esc</kbd> 還原。
        </p>
      </CardContent>
    </Card>
  );
}
