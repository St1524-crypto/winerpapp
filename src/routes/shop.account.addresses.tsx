import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { MapPin, Plus, Pencil, Trash2, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAddresses } from "@/hooks/use-addresses";
import type { CustomerAddress } from "@/types/shop";

export const Route = createFileRoute("/shop/account/addresses")({ component: AddressesPage });

const empty = { receiver_name: "", phone: "", city: "", postal_code: "", address: "", is_default: false };

function AddressesPage() {
  const { user } = useAuth();
  const { addresses, loading, refresh, setDefault } = useAddresses();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [pendingDefaultId, setPendingDefaultId] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setForm({ ...empty, is_default: addresses.length === 0 });
    setOpen(true);
  }
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
      const payload = {
        receiver_name: form.receiver_name, phone: form.phone, city: form.city || null,
        postal_code: form.postal_code || null, address: form.address, user_id: user.id,
      };
      if (editing) {
        const { error } = await supabase.from("customer_addresses").update(payload).eq("id", editing.id);
        if (error) throw error;
        if (form.is_default && !editing.is_default) {
          await supabase.rpc("set_default_address", { _address_id: editing.id });
        }
      } else {
        const { data: created, error } = await supabase.from("customer_addresses").insert(payload).select("id").single();
        if (error) throw error;
        if (form.is_default && created) {
          await supabase.rpc("set_default_address", { _address_id: created.id });
        }
      }
      toast.success(editing ? "已更新地址" : "已新增地址");
      setOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "儲存失敗");
    } finally { setSaving(false); }
  }

  async function remove(a: CustomerAddress) {
    if (!confirm(`確定要刪除「${a.receiver_name}」的地址？`)) return;
    const { error } = await supabase.from("customer_addresses").delete().eq("id", a.id);
    if (error) toast.error(error.message);
    else { toast.success("已刪除"); refresh(); }
  }

  async function handleSetDefault(id: string) {
    setPendingDefaultId(id);
    try {
      await setDefault(id);
      toast.success("已設為預設地址，結帳時將自動套用");
    } catch (e: any) {
      toast.error(e.message ?? "設定失敗");
    } finally {
      setPendingDefaultId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">收件地址</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">預設地址將在結帳時自動帶入</p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />新增地址</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : addresses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">尚未新增收件地址</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {addresses.map((a) => {
              const isPending = pendingDefaultId === a.id;
              return (
                <div
                  key={a.id}
                  className={`p-4 rounded-lg border transition relative ${
                    a.is_default
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/60 hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MapPin className={`h-4 w-4 ${a.is_default ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-medium text-sm">{a.receiver_name}</span>
                      {a.is_default && (
                        <Badge className="text-[10px] px-1.5 py-0 gap-1">
                          <Check className="h-2.5 w-2.5" />預設
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
                    <div>{a.phone}</div>
                    <div>{[a.postal_code, a.city, a.address].filter(Boolean).join(" ")}</div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {!a.is_default && (
                      <Button
                        size="sm" variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={isPending}
                        onClick={() => handleSetDefault(a.id)}
                      >
                        {isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                        設為預設
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEdit(a)}>
                      <Pencil className="h-3 w-3 mr-1" />編輯
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive ml-auto"
                      onClick={() => remove(a)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
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
              <span className="text-sm">設為預設地址（結帳時自動帶入）</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
