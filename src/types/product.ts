export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  image: string | null;
  sort_order: number;
  status: string;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  short_description: string | null;
  description: string | null;
  category_id: string | null;
  category: string | null;
  price: number;
  wholesale_price: number;
  cost_price?: number;
  stock: number;
  safe_stock: number;
  status: string;
  featured: boolean;
  image: string | null;
  reward_points: number;
  discount_points_max: number;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  sort_order: number;
  created_at: string;
}

export interface InventoryLog {
  id: string;
  product_id: string | null;
  type: string;
  quantity: number;
  before_stock: number;
  after_stock: number;
  reason: string | null;
  operator_id: string | null;
  created_at: string;
}

export const PRODUCT_STATUS = [
  { value: "active", label: "上架中" },
  { value: "draft", label: "草稿" },
  { value: "inactive", label: "已下架" },
] as const;

export type WholesaleTierVisibility = "all" | "vip" | "dealer";

export interface WholesaleTier {
  id?: string;
  product_id?: string;
  min_qty: number;
  max_qty: number | null;
  unit_price: number;
  unit_reward_points: number;
  sort_order: number;
  visibility?: WholesaleTierVisibility;
}
