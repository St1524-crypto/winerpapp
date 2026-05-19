import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Upload, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export function CompanyLogoUploader({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("圖片需小於 5MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("僅支援圖片檔"); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `companies/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Logo 已上傳");
    } catch (err: any) {
      toast.error("上傳失敗", { description: err?.message ?? "未知錯誤" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-20 w-20 rounded-xl bg-white ring-1 ring-border flex items-center justify-center overflow-hidden shrink-0">
        {value ? (
          <img src={value} alt="公司 Logo" className="h-full w-full object-contain" />
        ) : (
          <Building2 className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={busy || disabled}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            {value ? "更換 Logo" : "上傳 Logo"}
          </Button>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => onChange(null)}
              disabled={busy || disabled}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> 移除
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">支援 PNG / JPG / SVG，建議方形、小於 5MB。</p>
        <Input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>
    </div>
  );
}
