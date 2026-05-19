import { Link } from "@tanstack/react-router";

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
            <li><Link to="/shop/products">全部商品</Link></li>
            <li><Link to="/shop">熱銷推薦</Link></li>
            <li><Link to="/shop">新品上市</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3">客戶服務</div>
          <ul className="space-y-2 text-muted-foreground">
            <li>配送說明</li>
            <li>退換貨政策</li>
            <li>常見問題</li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3">關於我們</div>
          <ul className="space-y-2 text-muted-foreground">
            <li>品牌故事</li>
            <li>企業合作</li>
            <li>聯絡我們</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} 源晶 ERP 管理系統 · All rights reserved.
      </div>
    </footer>
  );
}
