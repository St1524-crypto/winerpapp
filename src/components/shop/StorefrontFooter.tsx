import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { LINE_OA_ID, LINE_OA_URL } from "@/components/LineContactButton";

export function StorefrontFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/20 mt-16 hidden md:block">
      <div className="container mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="font-semibold mb-3">源晶商城</div>
          <p className="text-muted-foreground text-xs leading-relaxed">企業級 ERP + B2C 電商整合平台，從供應鏈到消費者一站式服務。</p>
        </div>
        <div>
          <div className="font-semibold mb-3">購物指南</div>
          <ul className="space-y-2 text-muted-foreground">
            <li><Link to="/shop/products" search={{ q: "", cat: "", sort: "new", section: "" }}>全部商品</Link></li>
            <li><Link to="/shop">熱銷推薦</Link></li>
            <li><Link to="/shop">新品上市</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3">品牌內容</div>
          <ul className="space-y-2 text-muted-foreground">
            <li><Link to="/shop/patents">專利檢驗區</Link></li>
            <li><Link to="/shop/news">最新消息</Link></li>
            <li><Link to="/shop/health">健康學術</Link></li>
            <li><Link to="/shop/academy">源晶 AI 商學院</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3">關於我們</div>
          <ul className="space-y-2 text-muted-foreground">
            <li>品牌故事</li>
            <li>企業合作</li>
            <li>聯絡我們</li>
          </ul>
          <a
            href={LINE_OA_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`加入 LINE 官方帳號 ${LINE_OA_ID}`}
            title={`LINE 客服 ${LINE_OA_ID}`}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#06C755] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 transition"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2.5} />
            LINE 客服 {LINE_OA_ID}
          </a>
        </div>
      </div>

      <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} 源晶 ERP 管理系統 · All rights reserved.
      </div>
    </footer>
  );
}
