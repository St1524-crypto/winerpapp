import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getCompanySettings, upsertCompanySettings, listBankAccounts, upsertBankAccount, deleteBankAccount } from "@/lib/quotes.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/quote-settings")({
  component: QuoteSettingsPage,
});

const COMPANY_FIELDS: Array<[string, string, boolean?]> = [
  ["company_name", "公司名稱 *"],
  ["company_name_en", "英文名稱"],
  ["tax_id", "統一編號"],
  ["representative", "負責人"],
  ["phone", "電話"],
  ["fax", "傳真"],
  ["email", "Email"],
  ["address", "地址"],
  ["logo_url", "Logo URL"],
  ["website", "網站"],
  ["line_id", "LINE"],
];

function QuoteSettingsPage() {
  const qc = useQueryClient();
  const getCS = useServerFn(getCompanySettings);
  const upCS = useServerFn(upsertCompanySettings);
  const listBA = useServerFn(listBankAccounts);
  const upBA = useServerFn(upsertBankAccount);
  const delBA = useServerFn(deleteBankAccount);

  const { data: settings } = useQuery({ queryKey: ["quote-cs"], queryFn: () => getCS() });
  const { data: banks } = useQuery({ queryKey: ["quote-banks"], queryFn: () => listBA() });

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (settings) {
      const f: Record<string, string> = {};
      for (const [k] of COMPANY_FIELDS) f[k] = (settings as Record<string, unknown>)[k] as string ?? "";
      f.header_note = (settings as Record<string, unknown>).header_note as string ?? "";
      f.footer_text = (settings as Record<string, unknown>).footer_text as string ?? "";
      setForm(f);
    }
  }, [settings]);

  const [newBank, setNewBank] = useState({ bank_name: "", branch_name: "", bank_code: "", account_name: "", account_number: "", is_default: false, is_active: true, notes: "" });

  async function saveCompany() {
    try {
      await upCS({ data: form });
      toast.success("已儲存公司設定");
      qc.invalidateQueries({ queryKey: ["quote-cs"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "儲存失敗"); }
  }

  async function addBank() {
    if (!newBank.bank_name || !newBank.account_name || !newBank.account_number) return toast.error("請填寫銀行、戶名與帳號");
    try {
      await upBA({ data: newBank });
      setNewBank({ bank_name: "", branch_name: "", bank_code: "", account_name: "", account_number: "", is_default: false, is_active: true, notes: "" });
      qc.invalidateQueries({ queryKey: ["quote-banks"] });
      toast.success("已新增銀行帳號");
    } catch (e) { toast.error(e instanceof Error ? e.message : "新增失敗"); }
  }

  async function toggleBank(id: string, patch: Record<string, unknown>) {
    try { await upBA({ data: { id, ...patch } }); qc.invalidateQueries({ queryKey: ["quote-banks"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "更新失敗"); }
  }

  async function removeBank(id: string) {
    if (!confirm("刪除此銀行帳號？歷史報價單已保存快照不受影響。")) return;
    try { await delBA({ data: { id } }); qc.invalidateQueries({ queryKey: ["quote-banks"] }); toast.success("已刪除"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "刪除失敗"); }
  }

  return (
    <div className="container mx-auto p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">報價單設定</h1>
          <p className="text-sm text-muted-foreground">設定報價單顯示的公司抬頭與匯款銀行帳號</p>
        </div>
        <Button asChild variant="outline"><Link to="/admin/quotes">返回報價單</Link></Button>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">公司抬頭</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {COMPANY_FIELDS.map(([k, label]) => (
            <div key={k}><Label>{label}</Label><Input value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
          ))}
        </div>
        <div><Label>報價單頁首備註</Label><Textarea value={form.header_note ?? ""} onChange={(e) => setForm({ ...form, header_note: e.target.value })} /></div>
        <div><Label>報價單頁尾文字</Label><Textarea value={form.footer_text ?? ""} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} /></div>
        <div className="flex justify-end"><Button onClick={saveCompany}>儲存公司設定</Button></div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">匯款銀行帳號</h2>
        <div className="space-y-2">
          {(banks ?? []).map((b) => (
            <div key={b.id} className="border rounded p-3 flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">{b.bank_name} {b.branch_name ?? ""} {b.bank_code ? `(${b.bank_code})` : ""}</div>
                <div className="text-muted-foreground">{b.account_name} · <span className="font-mono">{b.account_number}</span></div>
                {b.notes ? <div className="text-xs text-muted-foreground">{b.notes}</div> : null}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1"><Switch checked={!!b.is_default} onCheckedChange={(v) => toggleBank(b.id, { is_default: v })} />預設</label>
                <label className="flex items-center gap-1"><Switch checked={!!b.is_active} onCheckedChange={(v) => toggleBank(b.id, { is_active: v })} />啟用</label>
                <Button size="icon" variant="ghost" onClick={() => removeBank(b.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="font-medium text-sm">新增銀行帳號</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Input placeholder="銀行名稱 *" value={newBank.bank_name} onChange={(e) => setNewBank({ ...newBank, bank_name: e.target.value })} />
            <Input placeholder="分行" value={newBank.branch_name} onChange={(e) => setNewBank({ ...newBank, branch_name: e.target.value })} />
            <Input placeholder="銀行代碼" value={newBank.bank_code} onChange={(e) => setNewBank({ ...newBank, bank_code: e.target.value })} />
            <Input placeholder="戶名 *" value={newBank.account_name} onChange={(e) => setNewBank({ ...newBank, account_name: e.target.value })} />
            <Input placeholder="帳號 *" value={newBank.account_number} onChange={(e) => setNewBank({ ...newBank, account_number: e.target.value })} />
            <Input placeholder="備註" value={newBank.notes} onChange={(e) => setNewBank({ ...newBank, notes: e.target.value })} />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><Switch checked={newBank.is_default} onCheckedChange={(v) => setNewBank({ ...newBank, is_default: v })} />設為預設</label>
            <label className="flex items-center gap-2"><Switch checked={newBank.is_active} onCheckedChange={(v) => setNewBank({ ...newBank, is_active: v })} />啟用</label>
            <Button onClick={addBank} className="ml-auto">新增</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
