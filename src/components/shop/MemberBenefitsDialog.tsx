import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getPublicShopContentPage } from "@/lib/shop-content.functions";

// Admin edits this via 後台「商城內容管理」，網址代稱固定為 member-benefits
export const MEMBER_BENEFITS_SLUG = "member-benefits";

export function MemberBenefitsDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["shop-content", MEMBER_BENEFITS_SLUG],
    enabled: open,
    retry: false,
    queryFn: async () => {
      try {
        const r = await getPublicShopContentPage({ data: { slug: MEMBER_BENEFITS_SLUG } });
        return r.page as any;
      } catch {
        return null;
      }
    },
  });
  const page = q.data;

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{page?.title || "會員說明"}</DialogTitle>
          </DialogHeader>
          {page?.content_html ? (
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: page.content_html }} />
          ) : page?.summary ? (
            <p className="whitespace-pre-line text-sm">{page.summary}</p>
          ) : (
            <ul className="space-y-3 text-sm">
              <li className="rounded-lg bg-muted p-3"><b>免費註冊會員</b>：即享會員特惠價。</li>
              <li className="rounded-lg bg-muted p-3"><b>升級 VIP</b>：即享團購拼購資格與推廣獎勵。</li>
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button asChild><Link to="/login" search={{ mode: "signup" } as any}>免費註冊</Link></Button>
            <Button asChild variant="outline"><Link to="/shop/vip">升級 VIP</Link></Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
