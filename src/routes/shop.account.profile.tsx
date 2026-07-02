import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Crown, ImageIcon, Loader2, Upload } from "lucide-react";
import { saveMyAccountProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/shop/account/profile")({ component: ProfilePage });

const SLUG_RE = /^[A-Za-z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function defaultDisplayName(name: string) {
  const trimmed = name.trim();
  return Array.from(trimmed).slice(0, 2).join("");
}

function normalizePhoneSlug(phone: string | null) {
  const normalized = (phone ?? "").replace(/[\s-]/g, "").replace(/^\+/, "");
  return SLUG_RE.test(normalized) ? normalized : "";
}

function friendlyProfileError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (/marketing_slug_format_invalid|check constraint|format/i.test(message)) {
    return "行銷網址代稱格式錯誤，請輸入 3-32 字元，可含 A-Z、a-z、0-9、_、-。";
  }
  if (/duplicate|unique|marketing_slug_conflict|member_no_marketing_slug_conflict|already/i.test(message)) {
    return "行銷網址代稱已和其他會員的行銷代稱或會員ID重複，請更換。";
  }
  if (/email/i.test(message) && /invalid/i.test(message)) {
    return "Email 格式錯誤，請確認後再儲存。";
  }
  if (/email/i.test(message) && /already|exists|registered/i.test(message)) {
    return "此 Email 已被其他帳號使用，請更換。";
  }
  if (/permission|policy|rls|not authorized/i.test(message)) {
    return "權限不足，無法儲存會員資料。";
  }

  return message || "儲存失敗，請確認欄位內容後再試一次。";
}

function ProfilePage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [memberNo, setMemberNo] = useState<string | null>(null);
  const [marketingSlug, setMarketingSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [vipTiers, setVipTiers] = useState<{ code: string; name: string; sort_order: number }[]>([]);
  const [myVip, setMyVip] = useState<{ isVip: boolean; tierCode: string | null; expiresAt: string | null }>({
    isVip: false,
    tierCode: null,
    expiresAt: null,
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("name, display_name, email, avatar_url, phone, member_no, marketing_slug, is_vip, vip_expires_at, vip_tier")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        toast.error(friendlyProfileError(error));
        setLoading(false);
        return;
      }

      const loadedName = data?.name ?? "";
      setName(loadedName);
      setDisplayName((data as any)?.display_name ?? defaultDisplayName(loadedName));
      setEmail(data?.email ?? user.email ?? "");
      setAvatarUrl(data?.avatar_url ?? "");
      setPhone(data?.phone ?? null);
      setMemberNo((data as any)?.member_no ?? null);
      setMarketingSlug((data as any)?.marketing_slug ?? (data as any)?.member_no ?? "");

      const { data: tiers } = await supabase
        .from("vip_tiers_public" as any)
        .select("code, name, sort_order")
        .order("sort_order", { ascending: true });
      setVipTiers(tiers ?? []);

      const isVipFlag = !!((data as any)?.is_vip);
      const expiresAt = (data as any)?.vip_expires_at as string | null;
      const expired = !!expiresAt && new Date(expiresAt) <= new Date();
      setMyVip({
        isVip: isVipFlag && !expired,
        tierCode: (data as any)?.vip_tier ?? null,
        expiresAt: expiresAt ?? null,
      });

      setLoading(false);
    })();
  }, [user]);

  async function uploadAvatar(file?: File) {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("請上傳圖片檔。");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("圖片不可超過 5MB。");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      toast.success("頭像已上傳，請按儲存套用。");
    } catch (error) {
      toast.error(friendlyProfileError(error));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function save() {
    if (!user) return;

    const nextName = name.trim();
    const nextDisplayName = displayName.trim() || defaultDisplayName(nextName);
    const nextEmail = email.trim();
    const slug = marketingSlug.trim();
    const fallbackSlug = normalizePhoneSlug(phone) || memberNo || "";
    const nextSlug = slug || fallbackSlug || null;

    if (!nextName) {
      toast.error("請輸入名稱。");
      return;
    }
    if (!nextDisplayName) {
      toast.error("請輸入對外匿稱。");
      return;
    }
    if (!EMAIL_RE.test(nextEmail)) {
      toast.error("Email 格式錯誤，請確認後再儲存。");
      return;
    }
    if (nextSlug && !SLUG_RE.test(nextSlug)) {
      toast.error("行銷網址代稱格式錯誤，請輸入 3-32 字元，可含 A-Z、a-z、0-9、_、-。");
      return;
    }

    setSaving(true);
    try {
      const result = await saveMyAccountProfile({
        data: {
          name: nextName,
          displayName: nextDisplayName,
          email: nextEmail,
          avatarUrl,
          marketingSlug: slug,
        },
      });

      setName(result.profile.name);
      setDisplayName(result.profile.display_name);
      setEmail(result.profile.email);
      setAvatarUrl(result.profile.avatar_url ?? "");
      setMarketingSlug(result.profile.marketing_slug ?? "");

      toast.success(result.emailChanged ? "個人資料已儲存，Email 已更新。" : "個人資料已儲存。");
    } catch (error) {
      toast.error(friendlyProfileError(error));
    } finally {
      setSaving(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const seg = marketingSlug.trim() || normalizePhoneSlug(phone) || memberNo || "";
  const marketingUrl = seg ? `${origin}/r/${seg}` : `${origin}/r/`;
  const avatarFallback = (displayName || name || user?.email || "?").charAt(0).toUpperCase();

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            會員等級
          </CardTitle>
          <CardDescription>查看目前的 VIP 階級與到期狀態。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant={myVip.isVip ? "default" : "secondary"}
              className="text-base px-3 py-1"
            >
              {myVip.isVip ? (myVip.tierCode ? `VIP ${myVip.tierCode}` : "VIP 會員") : "免費會員"}
            </Badge>
            {myVip.isVip && myVip.expiresAt && (
              <span className="text-sm text-muted-foreground">
                到期日：{new Date(myVip.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {vipTiers.map((tier) => {
              const active = myVip.isVip && myVip.tierCode === tier.code;
              return (
                <Badge key={tier.code} variant={active ? "default" : "outline"}>
                  {tier.code} — {tier.name}
                </Badge>
              );
            })}
          </div>

          {!myVip.isVip && (
            <p className="text-sm text-muted-foreground">升級 VIP 以享有更多回饋與分紅。</p>
          )}

          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link to="/shop/vip">前往 VIP 升級</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">個人資料</CardTitle>
          <CardDescription>管理會員中心顯示資料、登入 Email 與行銷網址。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-20 w-20">
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback className="text-lg">{avatarFallback}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Label>頭像圖片</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." />
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  上傳
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => uploadAvatar(event.target.files?.[0])}
              />
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ImageIcon className="h-3 w-3" />
                可貼上圖片網址，也可上傳 JPG / PNG / WebP 圖檔，單檔上限 5MB。
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>名稱</Label>
              <Input value={name} onChange={(event) => {
                const value = event.target.value;
                setName(value);
                if (!displayName.trim()) setDisplayName(defaultDisplayName(value));
              }} placeholder="請輸入名稱" />
            </div>
            <div className="space-y-2">
              <Label>對外匿稱</Label>
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={defaultDisplayName(name) || "例如：源晶"} />
              <p className="text-xs text-muted-foreground">未填寫時，預設使用名稱前兩個字。</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
            <p className="text-xs text-muted-foreground">修改 Email 後，系統可能會要求到新信箱完成驗證。</p>
          </div>

          <div className="space-y-2">
            <Label>行銷網址代稱</Label>
            <Input
              value={marketingSlug}
              onChange={(event) => setMarketingSlug(event.target.value)}
              placeholder="例如 alice-wang"
            />
            <p className="text-xs text-muted-foreground">
              3-32 字元，可含 A-Z a-z 0-9 _ -；留空則使用您的電話作為行銷網址，若無電話則使用會員ID。
            </p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <code className="flex-1 text-xs break-all">{marketingUrl}</code>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(marketingUrl);
                    toast.success("行銷網址已複製。");
                  } catch {
                    toast.error("複製失敗，請手動複製。");
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || uploading} className="bg-gradient-to-r from-primary to-primary/70">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              儲存
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
