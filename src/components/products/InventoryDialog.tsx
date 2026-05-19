import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Product } from "@/types/product";
import { useCurrentCompany } from "@/hooks/use-current-company";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  onDone: () => void;
}

export function InventoryDialog({ open, onOpenChange, product, onDone }: Props) {
  const [type, setType] = useState<"in" | "out" | "adjust">("in");
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!product) return;
    if (!qty || qty <= 0) { toast.error("請輸入大於 0 的數量"); return; }
    setSaving(true);
    try {
      const before = product.stock;
      let after = before;
      if (type === "in") after = before + qty;
      else if (type === "out") after = Math.max(0, before - qty);
      else after = qty;

      const { data: u } = await supabase.auth.getUser();
      const { error: e1 } = await supabase.from("inventory_logs").insert({
        product_id: product.id, type, quantity: qty,
        before_stock: before, after_stock: after,
        reason: reason || null, operator_id: u.user?.id ?? null,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("products").update({ stock: after }).eq("id", product.id);
      if (e2) throw e2;
      toast.success("庫存已更新");
      onDone();
      onOpenChange(false);
      setQty(0); setReason("");
    } catch (e: any) {
      toast.error(e.message ?? "操作失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>庫存異動 — {product?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3 text-sm">
            目前庫存：<span className="font-bold text-primary">{product?.stock ?? 0}</span>
          </div>
          <div className="space-y-2">
            <Label>異動類型</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">入庫 (+)</SelectItem>
                <SelectItem value="out">出庫 (−)</SelectItem>
                <SelectItem value="adjust">調整 (=)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{type === "adjust" ? "調整為" : "數量"}</Label>
            <Input type="number" value={qty} onChange={(e) => setQty(+e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>原因 / 備註</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={submit} disabled={saving} className="bg-gradient-primary">確認異動</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
