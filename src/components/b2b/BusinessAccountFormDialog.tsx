import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_LEVEL_LABELS, ACCOUNT_STATUS_LABELS, type BusinessAccount } from "@/hooks/use-business-accounts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: BusinessAccount | null;
  onSaved: () => void;
}

const empty = {
  company_name: "", tax_id: "", contact_name: "", phone: "", email: "", address: "",
  credit_limit: 0, payment_terms: 30, account_level: "retail", status: "pending", notes: "",
};

export function BusinessAccountFormDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initial ? { ...initial } : empty);
  }, [open, initial]);

  async function save() {
    if (!form.company_name) { toast.error("請輸入公司名稱"); return; }
    setSaving(true);
    const payload = {
      company_name: form.company_name, tax_id: form.tax_id || null,
      contact_name: form.contact_name || null, phone: form.phone || null, email: form.email || null,
      address: form.address || null, credit_limit: Number(form.credit_limit) || 0,
      payment_terms: Number(form.payment_terms) || 30, account_level: form.account_level,
      status: form.status, notes: form.notes || null,
    };
    const { error } = initial
      ? await supabase.from("business_accounts" as any).update(payload).eq("id", initial.id)
      : await supabase.from("business_accounts" as any).insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(initial ? "已更新廠商資料" : "已新增 B2B 廠商");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "編輯 B2B 廠商" : "新增 B2B 廠商"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>公司名稱 *</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
          <div><Label>統一編號</Label><Input value={form.tax_id ?? ""} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} /></div>
          <div><Label>聯絡人</Label><Input value={form.contact_name ?? ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
          <div><Label>電話</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="col-span-2"><Label>地址</Label><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>信用額度</Label><Input type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></div>
          <div><Label>月結天數</Label><Input type="number" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} /></div>
          <div>
            <Label>會員等級</Label>
            <Select value={form.account_level} onValueChange={(v) => setForm({ ...form, account_level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ACCOUNT_LEVEL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>狀態</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ACCOUNT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>備註</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-primary">{saving ? "儲存中..." : "儲存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
