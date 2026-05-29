import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Share2, Copy, QrCode, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  productId: string;
  productName: string;
}

/**
 * 商品分享按鈕：Line / Facebook / 複製連結 / QR Code
 * 自動將目前登入者的 referral_code / marketing_slug / member_no
 * 透過 ?ref= 參數附帶於分享連結。
 */
export function ShareProductButtons({ productId, productName }: Props) {
  const { user } = useAuth();
  const [refCode, setRefCode] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("referral_code, marketing_slug, member_no")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const code =
          (data as any)?.referral_code ||
          (data as any)?.marketing_slug ||
          (data as any)?.member_no ||
          "";
        if (code) setRefCode(String(code));
      });
  }, [user]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const path = `/shop/product/${productId}`;
  const shareUrl = refCode
    ? `${origin}${path}?ref=${encodeURIComponent(refCode)}`
    : `${origin}${path}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(refCode ? "已複製含推薦碼的連結" : "已複製連結");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("複製失敗");
    }
  }

  function shareLine() {
    const url = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=600");
  }
  function shareFB() {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=600");
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="lg" variant="outline" className="px-3" title="分享商品">
          <Share2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">分享「{productName}」</p>
            {refCode ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                推薦碼:<span className="font-mono text-primary">{refCode}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                {user ? "您尚未取得推薦碼" : "登入後將自動帶入您的推薦碼"}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={shareLine}>
              <span className="text-xs">LINE 分享</span>
            </Button>
            <Button size="sm" variant="outline" onClick={shareFB}>
              <span className="text-xs">Facebook</span>
            </Button>
          </div>

          <Button size="sm" variant="secondary" className="w-full" onClick={copyLink}>
            {copied ? <Check className="h-4 w-4 mr-1 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? "已複製" : "複製分享連結"}
          </Button>

          <div className="rounded-md border bg-muted/30 p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              <QrCode className="h-3 w-3" /> 掃描 QR Code
            </div>
            <img
              src={qrSrc}
              alt="商品分享 QR"
              className="mx-auto h-32 w-32 bg-white rounded"
              loading="lazy"
            />
          </div>

          <p className="text-[10px] text-muted-foreground break-all">
            {shareUrl}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
