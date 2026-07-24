import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { generateSku } from "@/lib/sku";
import type { Category } from "@/types/product";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: Category[];
  onDone: () => void;
}

// Target fields definition
type FieldDef = { key: string; label: string; required?: boolean; type: "string" | "number" | "int" | "bool" | "status" | "category" };
const FIELDS: FieldDef[] = [
  { key: "sku", label: "SKU（留空自動產生）", type: "string" },
  { key: "name", label: "商品名稱 *", required: true, type: "string" },
  { key: "category", label: "分類名稱", type: "category" },
  { key: "price", label: "售價", type: "number" },
  { key: "wholesale_price", label: "批發價", type: "number" },
  { key: "cost_price", label: "成本價", type: "number" },
  { key: "stock", label: "庫存", type: "int" },
  { key: "safe_stock", label: "安全庫存", type: "int" },
  { key: "reward_points", label: "獎勵點", type: "int" },
  { key: "discount_points_max", label: "可折抵點數上限", type: "int" },
  { key: "display_priority", label: "優先順位", type: "int" },
  { key: "status", label: "狀態 (active/draft/inactive)", type: "status" },
  { key: "featured", label: "熱門 (true/false)", type: "bool" },
  { key: "wholesale_only", label: "僅批發 (true/false)", type: "bool" },
  { key: "short_description", label: "簡短描述", type: "string" },
  { key: "description", label: "完整描述", type: "string" },
  { key: "image", label: "主圖 URL", type: "string" },
];

// Fuzzy auto-mapping by header name
const HEADER_ALIASES: Record<string, string> = {
  sku: "sku", "商品編號": "sku", "貨號": "sku",
  name: "name", "商品名稱": "name", "名稱": "name", "品名": "name",
  category: "category", "分類": "category", "類別": "category",
  price: "price", "售價": "price", "價格": "price", "零售價": "price",
  wholesale_price: "wholesale_price", "批發價": "wholesale_price",
  cost_price: "cost_price", "成本": "cost_price", "成本價": "cost_price",
  stock: "stock", "庫存": "stock", "庫存量": "stock",
  safe_stock: "safe_stock", "安全庫存": "safe_stock",
  reward_points: "reward_points", "獎勵點": "reward_points", "獎勵點數": "reward_points",
  discount_points_max: "discount_points_max", "可折抵點數": "discount_points_max",
  display_priority: "display_priority", "優先順位": "display_priority", "排序": "display_priority",
  status: "status", "狀態": "status",
  featured: "featured", "熱門": "featured",
  wholesale_only: "wholesale_only", "僅批發": "wholesale_only",
  short_description: "short_description", "簡短描述": "short_description",
  description: "description", "描述": "description", "說明": "description",
  image: "image", "圖片": "image", "主圖": "image",
};

type ParsedRow = Record<string, any>;
type RowError = { row: number; errors: string[] };

function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const key = HEADER_ALIASES[h.trim()] ?? HEADER_ALIASES[h.trim().toLowerCase()];
    if (key) map[key] = h;
  }
  return map;
}

function toBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "是" || s === "y";
}

export function ProductBulkImportDialog({ open, onOpenChange, categories, onDone }: Props) {
  const { currentCompanyId } = useCurrentCompany();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [updateBySku, setUpdateBySku] = useState(true);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);

  const categoryByName = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.name.trim().toLowerCase(), c.id));
    return m;
  }, [categories]);

  function reset() {
    setStep(1); setRawRows([]); setHeaders([]); setMapping({}); setProgress(0); setResult(null);
  }

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: "", raw: false });
      if (!json.length) { toast.error("檔案沒有資料"); return; }
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setRawRows(json);
      setMapping(autoMap(hdrs));
      setStep(2);
    } catch (e: any) {
      toast.error(`檔案解析失敗：${e.message}`);
    }
  }

  // Build normalized rows + row errors
  const { normalized, rowErrors } = useMemo(() => {
    const errs: RowError[] = [];
    const seenSku = new Set<string>();
    const rows = rawRows.map((raw, idx) => {
      const rowErrors: string[] = [];
      const obj: any = {};
      for (const f of FIELDS) {
        const srcCol = mapping[f.key];
        const val = srcCol ? raw[srcCol] : "";
        const s = val == null ? "" : String(val).trim();
        if (f.required && !s) rowErrors.push(`${f.label} 必填`);
        if (!s) { obj[f.key] = f.type === "number" || f.type === "int" ? 0 : f.type === "bool" ? false : null; continue; }
        switch (f.type) {
          case "number":
          case "int": {
            const n = Number(s.replace(/,/g, ""));
            if (Number.isNaN(n)) rowErrors.push(`${f.label} 非數字：${s}`);
            obj[f.key] = f.type === "int" ? Math.floor(n) : n;
            break;
          }
          case "bool": obj[f.key] = toBool(s); break;
          case "status":
            if (!["active", "draft", "inactive"].includes(s)) rowErrors.push(`狀態需為 active/draft/inactive：${s}`);
            obj[f.key] = s; break;
          case "category": {
            const id = categoryByName.get(s.toLowerCase());
            if (!id) rowErrors.push(`分類不存在：${s}`);
            obj.category_id = id ?? null; obj.category = s; break;
          }
          default: obj[f.key] = s;
        }
      }
      if (obj.sku) {
        if (seenSku.has(obj.sku)) rowErrors.push(`檔案內 SKU 重複：${obj.sku}`);
        seenSku.add(obj.sku);
      }
      if (rowErrors.length) errs.push({ row: idx + 2, errors: rowErrors });
      return obj;
    });
    return { normalized: rows, rowErrors: errs };
  }, [rawRows, mapping, categoryByName]);

  async function runImport() {
    if (!currentCompanyId) { toast.error("尚未選擇公司"); return; }
    setStep(4); setProgress(0);
    const errors: string[] = [];
    let ok = 0, fail = 0;

    for (let i = 0; i < normalized.length; i++) {
      const rowNum = i + 2;
      const row = normalized[i];
      const hasErr = rowErrors.find((e) => e.row === rowNum);
      if (hasErr) { fail++; setProgress(Math.round(((i + 1) / normalized.length) * 100)); continue; }
      try {
        let sku = row.sku as string | null;
        if (!sku) {
          const cat = categories.find((c) => c.id === row.category_id);
          sku = await generateSku(cat?.name ?? "GEN");
        }
        const payload: any = {
          sku,
          name: row.name,
          short_description: row.short_description || null,
          description: row.description || null,
          category_id: row.category_id || null,
          category: row.category || null,
          price: row.price || 0,
          wholesale_price: row.wholesale_price || 0,
          cost_price: row.cost_price || 0,
          stock: Math.max(0, row.stock || 0),
          safe_stock: Math.max(0, row.safe_stock || 0),
          reward_points: Math.max(0, row.reward_points || 0),
          discount_points_max: Math.max(0, row.discount_points_max || 0),
          display_priority: row.display_priority || 0,
          status: row.status || "draft",
          featured: !!row.featured,
          wholesale_only: !!row.wholesale_only,
          image: row.image || null,
          company_id: currentCompanyId,
        };
        // Force draft if no image
        if (!payload.image) payload.status = payload.status === "active" ? "inactive" : payload.status;

        let existingId: string | null = null;
        if (updateBySku && sku) {
          const { data } = await supabase.from("products").select("id").eq("sku", sku).eq("company_id", currentCompanyId).maybeSingle();
          existingId = data?.id ?? null;
        }
        if (existingId) {
          const { company_id, ...upd } = payload;
          const { error } = await supabase.from("products").update(upd).eq("id", existingId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("products").insert(payload);
          if (error) throw error;
        }
        ok++;
      } catch (e: any) {
        fail++;
        if (errors.length < 20) errors.push(`第 ${rowNum} 列：${e.message}`);
      }
      setProgress(Math.round(((i + 1) / normalized.length) * 100));
    }
    setResult({ ok, fail, errors });
    if (ok > 0) onDone();
  }

  function downloadTemplate() {
    const rows = [{
      sku: "", name: "範例商品", category: categories[0]?.name ?? "",
      price: 1000, wholesale_price: 800, cost_price: 500,
      stock: 100, safe_stock: 10, reward_points: 0, discount_points_max: 0,
      display_priority: 0, status: "draft", featured: false, wholesale_only: false,
      short_description: "", description: "", image: "",
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "products");
    XLSX.writeFile(wb, "products-import-template.xlsx");
  }

  function close() { onOpenChange(false); setTimeout(reset, 200); }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />商品批次匯入</DialogTitle>
          <DialogDescription>
            步驟 {step} / 4：{step === 1 ? "上傳檔案" : step === 2 ? "欄位映射" : step === 3 ? "驗證預覽" : "執行匯入"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>支援格式</AlertTitle>
                <AlertDescription>CSV、Excel (.xlsx / .xls)。第一列為欄位標題。建議先下載範本填寫。</AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button variant="outline" onClick={downloadTemplate}><Download className="h-4 w-4 mr-2" />下載範本</Button>
              </div>
              <label className="block border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:bg-muted/40">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm">點擊選擇檔案或拖曳到此處</p>
                <p className="text-xs text-muted-foreground mt-1">CSV / Excel</p>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>已讀取 <b>{rawRows.length}</b> 列，請確認欄位對應。系統已依欄位名稱自動配對。</AlertDescription>
              </Alert>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <div className="w-40 text-sm shrink-0">{f.label}</div>
                    <Select value={mapping[f.key] ?? "__none__"} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— 不匯入 —</SelectItem>
                        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Checkbox id="upd" checked={updateBySku} onCheckedChange={(v) => setUpdateBySku(!!v)} />
                <label htmlFor="upd" className="text-sm">若 SKU 已存在則更新（否則跳過為新增）</label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <Badge variant="outline" className="text-sm">總列數：{normalized.length}</Badge>
                <Badge variant={rowErrors.length ? "destructive" : "default"} className="text-sm">
                  錯誤：{rowErrors.length}
                </Badge>
                <Badge variant="default" className="text-sm bg-green-600">可匯入：{normalized.length - rowErrors.length}</Badge>
              </div>
              {rowErrors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 max-h-48 overflow-y-auto text-sm space-y-1">
                  {rowErrors.slice(0, 50).map((e) => (
                    <div key={e.row}><b>第 {e.row} 列：</b>{e.errors.join("；")}</div>
                  ))}
                  {rowErrors.length > 50 && <div className="text-muted-foreground">…另 {rowErrors.length - 50} 列有錯誤</div>}
                </div>
              )}
              <div className="rounded-md border overflow-auto max-h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">列</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>名稱</TableHead>
                      <TableHead>分類</TableHead>
                      <TableHead className="text-right">售價</TableHead>
                      <TableHead className="text-right">庫存</TableHead>
                      <TableHead>狀態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {normalized.slice(0, 20).map((r, i) => {
                      const err = rowErrors.find((e) => e.row === i + 2);
                      return (
                        <TableRow key={i} className={err ? "bg-destructive/5" : ""}>
                          <TableCell>{i + 2}</TableCell>
                          <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell>{r.category ?? "—"}</TableCell>
                          <TableCell className="text-right">{r.price}</TableCell>
                          <TableCell className="text-right">{r.stock}</TableCell>
                          <TableCell>{r.status || "draft"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {normalized.length > 20 && <div className="p-2 text-xs text-center text-muted-foreground">僅顯示前 20 列預覽</div>}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <Progress value={progress} />
              <p className="text-center text-sm text-muted-foreground">{progress}%</p>
              {result && (
                <Alert variant={result.fail > 0 ? "destructive" : "default"}>
                  {result.fail > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  <AlertTitle>匯入完成</AlertTitle>
                  <AlertDescription>
                    成功 {result.ok} 筆，失敗 {result.fail} 筆
                    {result.errors.length > 0 && (
                      <div className="mt-2 max-h-40 overflow-y-auto text-xs space-y-0.5">
                        {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 1 && <Button variant="outline" onClick={close}>取消</Button>}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>上一步</Button>
              <Button onClick={() => setStep(3)} disabled={!mapping.name}>下一步：驗證</Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)}>上一步</Button>
              <Button onClick={runImport} disabled={normalized.length - rowErrors.length === 0}>
                開始匯入（{normalized.length - rowErrors.length} 筆）
              </Button>
            </>
          )}
          {step === 4 && result && <Button onClick={close}>關閉</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
