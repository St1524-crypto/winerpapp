import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dealer-program")({
  component: DealerProgramSettings,
});

type Setting = {
  key: string;
  value: number;
  unit: string | null;
  label: string;
  description: string | null;
  category: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  qualification: "資格與考核",
  rewards: "回饋與分紅",
  general: "一般",
};

function DealerProgramSettings() {
  const [rows, setRows] = useState<Setting[]>([]);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("dealer_program_settings" as any)
      .select("*")
      .order("category")
      .order("key");
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as any);
    setEdits({});
  }
  useEffect(() => { load(); }, []);

  async function saveAll() {
    const changes = Object.entries(edits);
    if (changes.length === 0) { toast.info("沒有變更"); return; }
    setSaving(true);
    try {
      for (const [key, value] of changes) {
        const { error } = await supabase
          .from("dealer_program_settings" as any)
          .update({ value, updated_at: new Date().toISOString() })
          .eq("key", key);
        if (error) throw error;
      }
      toast.success(`已儲存 ${changes.length} 項變更`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  const grouped = rows.reduce<Record<string, Setting[]>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />經銷商制度設定
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理全域變數（資格門檻、回饋比例、分紅上限等），所有數值可動態調整
          </p>
        </div>
        <Button onClick={saveAll} disabled={saving || Object.keys(edits).length === 0} className="bg-gradient-primary">
          <Save className="h-4 w-4 mr-1" />儲存變更{Object.keys(edits).length > 0 && `（${Object.keys(edits).length}）`}
        </Button>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <Card key={cat}>
          <CardHeader><CardTitle className="text-base">{CATEGORY_LABEL[cat] ?? cat}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {items.map((s) => {
              const current = edits[s.key] ?? s.value;
              const dirty = edits[s.key] !== undefined && edits[s.key] !== s.value;
              return (
                <div key={s.key} className="grid sm:grid-cols-[1fr_200px] gap-3 items-start pb-4 border-b last:border-0 last:pb-0">
                  <div>
                    <Label className={dirty ? "text-primary font-semibold" : ""}>{s.label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                    <code className="text-[10px] text-muted-foreground/70">{s.key}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={current}
                      onChange={(e) => setEdits({ ...edits, [s.key]: Number(e.target.value) })}
                      className={dirty ? "border-primary" : ""}
                    />
                    {s.unit && <span className="text-sm text-muted-foreground whitespace-nowrap">{s.unit}</span>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {rows.length === 0 && <p className="text-center text-muted-foreground py-12">載入中…</p>}
    </div>
  );
}
