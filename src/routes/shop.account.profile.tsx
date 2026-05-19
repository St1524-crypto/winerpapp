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
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/shop/account/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      setName(data?.name ?? "");
      setAvatarUrl(data?.avatar_url ?? "");
      setLoading(false);
    })();
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ name, avatar_url: avatarUrl || null }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("個人資料已更新");
  }

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
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-primary to-primary/70">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}儲存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
