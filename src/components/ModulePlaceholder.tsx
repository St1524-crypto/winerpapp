import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ModulePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <Card className="border-dashed">
        <CardHeader>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary/20 mb-2">
            <Construction className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-center text-base">模組開發中</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground pb-10">
          此模組將於下一階段交付完整功能。<br />
          目前資料庫結構與權限已就緒，可開始串接 API。
        </CardContent>
      </Card>
    </div>
  );
}
