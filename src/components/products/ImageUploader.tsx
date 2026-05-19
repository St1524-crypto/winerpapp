import { useRef, useState } from "react";
import { Upload, X, Loader2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface UploaderImage { id?: string; url: string; sort: number; }

interface Props {
  images: UploaderImage[];
  onChange: (next: UploaderImage[]) => void;
  max?: number;
}

export function ImageUploader({ images, onChange, max = 8 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (images.length + arr.length > max) {
      toast.error(`最多 ${max} 張圖片`);
      return;
    }
    setUploading(true);
    try {
      const next = [...images];
      for (const f of arr) {
        if (!f.type.startsWith("image/")) continue;
        if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} 超過 5MB`); continue; }
        const ext = f.name.split(".").pop() ?? "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("product-images").upload(path, f, { cacheControl: "3600", upsert: false });
        if (error) { toast.error(error.message); continue; }
        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
        next.push({ url: pub.publicUrl, sort: next.length });
      }
      onChange(next);
    } finally {
      setUploading(false);
    }
  }

  function remove(i: number) {
    const next = images.filter((_, idx) => idx !== i).map((im, idx) => ({ ...im, sort: idx }));
    onChange(next);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next.map((im, idx) => ({ ...im, sort: idx })));
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
        }}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        )}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
        ) : (
          <>
            <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="text-sm mt-2">點擊或拖曳圖片到此處</p>
            <p className="text-xs text-muted-foreground mt-1">PNG / JPG / WEBP，最大 5MB，最多 {max} 張</p>
          </>
        )}
        <input
          ref={inputRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {images.map((im, i) => (
            <div key={im.url} className="relative group rounded-lg overflow-hidden border border-border bg-muted aspect-square">
              <img src={im.url} alt="" className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded">主圖</span>
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <Button size="icon" variant="secondary" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); move(i, i - 1); }} title="左移">
                  <GripVertical className="h-3.5 w-3.5 rotate-180" />
                </Button>
                <Button size="icon" variant="secondary" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); move(i, i + 1); }} title="右移">
                  <GripVertical className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="destructive" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); remove(i); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
