import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { getGroupBuySettings, updateGroupBuySettings } from "@/lib/webhooks.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/group-buy-settings")({
  component: GBSettings,
});

function GBSettings() {
  const fn = useServerFn(getGroupBuySettings);
  const upd = useServerFn(updateGroupBuySettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["gb-settings"], queryFn: () => fn() });
  const [form, setForm] = useState({
    winner_reward_pct: 80, initiator_reward_pct: 10,
    default_duration_days: 7, target_count: 6, max_orders_per_user: 2,
  });
  useEffect(() => { if (data?.settings) setForm(data.settings as any); }, [data]);

  async function save() {
    try {
      await upd({ data: form });
      toast.success("已儲存");
      qc.invalidateQueries({ queryKey: ["gb-settings"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">拼團與獎勵設定</h1>
      <Card>
        <CardHeader><CardTitle>獎勵與規則</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[
            ["winner_reward_pct", "中獎者購物點 %", "成團後中獎者獲得（總金額 ×）%"],
            ["initiator_reward_pct", "發起人獎勵點 %", "發起人固定獲得（總金額 ×）%"],
            ["default_duration_days", "預設拼團期限（天）", ""],
            ["target_count", "成團人數", ""],
            ["max_orders_per_user", "每人限購單數", ""],
          ].map(([k, label, hint]) => (
            <div key={k}>
              <Label>{label}</Label>
              <Input type="number" value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
              {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
            </div>
          ))}
          <Button onClick={save}>儲存</Button>
        </CardContent>
      </Card>
    </div>
  );
}
