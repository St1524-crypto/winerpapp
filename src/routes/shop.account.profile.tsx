import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Loader2, Copy } from "lucide-react";

export const Route = createFileRoute("/shop/account/profile")({ component: ProfilePage });

const SLUG_RE = /^[A-Za-z0-9_-]{3,32}$/;

function ProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [memberNo, setMemberNo] = useState<string | null>(null);
  const [marketingSlug, setMarketingSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("name, avatar_url, phone, member_no, marketing_slug")
        .eq("id", user.id)
        .maybeSingle();
      setName(data?.name ?? "");
      setAvatarUrl(data?.avatar_url ?? "");
      setPhone(data?.phone ?? null);
      setMemberNo((data as any)?.member_no ?? null);
      setMarketingSlug((data as any)?.marketing_slug ?? (data as any)?.member_no ?? "");
      setLoading(false);
    })();
  }, [user]);

  async function save() {
    if (!user) return;
    const slug = marketingSlug.trim();
    if (slug && !SLUG_RE.test(slug)) {
      toast.error("行銷代稱僅可含英數字、底線或連字號，長度 3-32");
      return;
    }
    setSaving(true);
    // Snapshot prior slug for audit diff
    const { data: prior } = await supabase
      .from("profiles")
      .select("marketing_slug")
      .eq("id", user.id)
      .maybeSingle();
    const prevSlug = ((prior as any)?.marketing_slug ?? null) as string | null;
    const nextSlug = slug || memberNo || null;

    const { error } = await supabase
      .from("profiles")
      .update({
        name,
        avatar_url: avatarUrl || null,
        marketing_slug: nextSlug,
      } as any)
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      if (/duplicate|unique|行銷代碼|會員ID|marketing/i.test(error.message)) {
        toast.error("此行銷代碼已和其它會員行銷代碼或會員ID重複，請更換。");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("個人資料已更新");

    // Audit log: marketing_slug change by user themselves
    if ((prevSlug ?? null) !== (nextSlug ?? null)) {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        entity: "profiles.marketing_slug",
        entity_id: user.id,
        action: "marketing_slug_changed",
        metadata: {
          source: "self",
          actor_id: user.id,
          target_user_id: user.id,
          before: prevSlug,
          after: nextSlug,
          changed_at: new Date().toISOString(),
        },
      } as any);
    }
  }


  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const seg = marketingSlug.trim() || memberNo || "";
  const marketingUrl = seg ? `${origin}/r/${seg}` : "";

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">個人資料</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {avatarUrl && <AvatarImage src={avatarUrl} />}
            <AvatarFallback className="text-lg">{(name || user?.email || "?").charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Label className="text-xs">頭像網址</Label>
            <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <div className="space-y-2">
          <Label>名稱</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="請輸入名稱" />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={user?.email ?? ""} disabled />
          <p className="text-xs text-muted-foreground">Email 無法修改</p>
        </div>
        <div className="space-y-2">
          <Label>行銷網址代稱</Label>
          <Input
            value={marketingSlug}
            onChange={(e) => setMarketingSlug(e.target.value)}
            placeholder="例如 alice-wang"
          />
          <p className="text-xs text-muted-foreground">
            3-32 字元，可含 A-Z a-z 0-9 _ -；留空則使用您的電話作為行銷網址。
          </p>
          {marketingUrl && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <code className="flex-1 text-xs break-all">{marketingUrl}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(marketingUrl);
                    toast.success("行銷網址已複製");
                  } catch { toast.error("複製失敗"); }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-primary to-primary/70">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}儲存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
