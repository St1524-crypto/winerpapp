export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  bundle_id?: string | null;
  bundle_line_key?: string | null;
  product?: {
    id: string;
    name: string;
    sku: string;
    price: number;
    wholesale_price?: number;
    image: string | null;
    stock: number;
    status: string;
  };
}

export interface Cart {
  id: string;
  user_id: string | null;
  session_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  name: string;
  type: "fixed" | "percent";
  value: number;
  min_amount: number;
  usage_limit: number;
  used_count: number;
  expired_at: string | null;
  status: string;
}

export interface CustomerAddress {
  id: string;
  user_id: string;
  receiver_name: string;
  phone: string;
  address: string;
  city: string | null;
  postal_code: string | null;
  is_default: boolean;
  created_at: string;
}

export interface SalesOrder {
  id: string;
  order_no: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  receiver_name: string;
  receiver_phone: string;
  shipping_address: string;
  shipping_method: string;
  invoice_type: string | null;
  invoice_tax_id: string | null;
  notes: string | null;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  coupon_code: string | null;
  total_amount: number;
  payment_status: string;
  shipping_status: string;
  order_status: string;
  created_at: string;
  updated_at: string;
}

export interface SalesOrderItem {
  id: string;
  sales_order_id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  image: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "待付款",
  paid: "已付款",
  picking: "撿貨中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
  returned: "退貨",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "待付款",
  paid: "已付款",
  refunded: "已退款",
  failed: "付款失敗",
};

export const SHIPPING_STATUS_LABELS: Record<string, string> = {
  pending: "待出貨",
  preparing: "撿貨中",
  shipped: "已出貨",
  delivered: "已送達",
  returned: "已退貨",
};
