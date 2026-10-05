import { useQuery } from "@tanstack/react-query";
import { getPublicShopContentPage } from "@/lib/shop-content.functions";

// Admin edits via 後台「商城內容管理」，網址代稱固定 topup-bank-info（內容寫在摘要或內文）
export const TOPUP_BANK_SLUG = "topup-bank-info";

export function TopupBankInfo({ show }: { show: boolean }) {
  const q = useQuery({
    queryKey: ["shop-content", TOPUP_BANK_SLUG],
    enabled: show,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return (await getPublicShopContentPage({ data: { slug: TOPUP_BANK_SLUG } })).page as any;
      } catch {
        return null;
      }
    },
  });
  if (!show) return null;
  const page = q.data;
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="mb-1 font-semibold">{page?.title || "匯款銀行帳號"}</div>
      {q.isLoading ? (
        <p className="text-muted-foreground">載入中…</p>
      ) : page?.content_html ? (
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: page.content_html }} />
      ) : page?.summary ? (
        <p className="whitespace-pre-line select-all">{page.summary}</p>
      ) : (
        <p className="text-muted-foreground">管理員尚未設定匯款帳號，請洽客服。</p>
      )}
    </div>
  );
}
