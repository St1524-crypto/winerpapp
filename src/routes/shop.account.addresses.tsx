import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { MapPin, Plus, Pencil, Trash2, Star } from "lucide-react";
import type { CustomerAddress } from "@/types/shop";

export const Route = createFileRoute("/shop/account/addresses")({ component: AddressesPage });

const empty = { receiver_name: "", phone: "", city: "", postal_code: "", address: "", is_default: false };

function AddressesPage() {
  const { user } = useAuth();
  const [list, setList] = useState<CustomerAddress[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    setList((data ?? []) as CustomerAddress[]);
  }
  useEffect(() => { load(); }, [user]);

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(a: CustomerAddress) {
    setEditing(a);
    setForm({
      receiver_name: a.receiver_name, phone: a.phone, city: a.city ?? "",
      postal_code: a.postal_code ?? "", address: a.address, is_default: a.is_default,
    });
    setOpen(true);
  }

  async function save() {
    if (!user) return;
    if (!form.receiver_name || !form.phone || !form.address) {
      toast.error("請填寫收件人、電話、地址");
      return;
    }
    setSaving(true);
    try {
      if (form.is_default) {
        await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", user.id);
      }
      const payload = { ...form, user_id: user.id };
      const { error } = editing
        ? await supabase.from("customer_addresses").update(payload).eq("id", editing.id)
        : await supabase.from("customer_addresses").insert(payload);
      if (error) throw error;
      toast.success(editing ? "已更新地址" : "已新增地址");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "儲存失敗");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("確定要刪除此地址？")) return;
    const { error } = await supabase.from("customer_addresses").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("已刪除"); load(); }
  }

  async function setDefault(id: string) {
    if (!user) return;
    await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("customer_addresses").update({ is_default: true }).eq("id", id);
    load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">收件地址</CardTitle>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />新增地址</Button>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">尚未新增收件地址</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {list.map((a) => (
              <div key={a.id} className="p-4 rounded-lg border border-border/60 hover:border-primary/50 transition">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">{a.receiver_name}</span>
                    {a.is_default && <Badge className="text-[10px] px-1.5 py-0">預設</Badge>}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
                  <div>{a.phone}</div>
                  <div>{[a.postal_code, a.city, a.address].filter(Boolean).join(" ")}</div>
                </div>
                <div className="flex gap-1">
                  {!a.is_default && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDefault(a.id)}>
                      <Star className="h-3 w-3 mr-1" />設為預設
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEdit(a)}>
                    <Pencil className="h-3 w-3 mr-1" />編輯
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => remove(a.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "編輯地址" : "新增地址"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>收件人 *</Label>
                <Input value={form.receiver_name} onChange={(e) => setForm({ ...form, receiver_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>電話 *</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <div className="space-y-1.5">
                <Label>郵遞區號</Label>
                <Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>縣市</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>詳細地址 *</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 pt-2 cursor-pointer">
              <Checkbox checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: !!v })} />
              <span className="text-sm">設為預設地址</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
