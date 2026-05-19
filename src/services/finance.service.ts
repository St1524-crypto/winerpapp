import { supabase } from "@/integrations/supabase/client";

// 為避免 types.ts 尚未同步，先以 any 操作；後續可改為強型別
const sb: any = supabase;

// ============= Bank Accounts =============
export interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_no: string;
  currency: string;
  balance: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const bankAccountsRepo = {
  async list(): Promise<BankAccount[]> {
    const { data } = await sb.from("bank_accounts").select("*").order("created_at", { ascending: false });
    return (data ?? []) as BankAccount[];
  },
  async create(input: Partial<BankAccount>) {
    const { error } = await sb.from("bank_accounts").insert(input);
    if (error) throw error;
  },
  async update(id: string, patch: Partial<BankAccount>) {
    const { error } = await sb.from("bank_accounts").update(patch).eq("id", id);
    if (error) throw error;
  },
  async remove(id: string) {
    const { error } = await sb.from("bank_accounts").delete().eq("id", id);
    if (error) throw error;
  },
};

// ============= Finance Transactions =============
export type TxType = "income" | "expense" | "transfer";
export interface FinanceTransaction {
  id: string;
  type: TxType;
  category: string;
  amount: number;
  payment_method: string;
  bank_account_id: string | null;
  reference_no: string | null;
  reference_type: string | null;
  description: string | null;
  occurred_at: string;
  created_at: string;
}

export const transactionsRepo = {
  async list(filters: { type?: TxType; from?: string; to?: string } = {}): Promise<FinanceTransaction[]> {
    let q = sb.from("finance_transactions").select("*").order("occurred_at", { ascending: false }).limit(200);
    if (filters.type) q = q.eq("type", filters.type);
    if (filters.from) q = q.gte("occurred_at", filters.from);
    if (filters.to) q = q.lte("occurred_at", filters.to);
    const { data } = await q;
    return (data ?? []) as FinanceTransaction[];
  },
  async create(input: Partial<FinanceTransaction>) {
    const { error } = await sb.from("finance_transactions").insert(input);
    if (error) throw error;
  },
  async remove(id: string) {
    const { error } = await sb.from("finance_transactions").delete().eq("id", id);
    if (error) throw error;
  },
  async summary(): Promise<{ income: number; expense: number; net: number }> {
    const { data } = await sb.from("finance_transactions").select("type, amount");
    let income = 0, expense = 0;
    (data ?? []).forEach((t: any) => {
      if (t.type === "income") income += Number(t.amount) || 0;
      else if (t.type === "expense") expense += Number(t.amount) || 0;
    });
    return { income, expense, net: income - expense };
  },
};

// ============= Accounts Receivable =============
export interface Receivable {
  id: string;
  business_account_id: string | null;
  customer_name: string;
  invoice_no: string;
  reference_order_id: string | null;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export const receivablesRepo = {
  async list(status?: string): Promise<Receivable[]> {
    let q = sb.from("accounts_receivable").select("*").order("due_date", { ascending: true });
    if (status && status !== "all") q = q.eq("status", status);
    const { data } = await q;
    return (data ?? []) as Receivable[];
  },
  async create(input: Partial<Receivable>) {
    const { error } = await sb.from("accounts_receivable").insert(input);
    if (error) throw error;
  },
  async recordPayment(id: string, amount: number) {
    const { data: cur } = await sb.from("accounts_receivable").select("paid_amount,total_amount").eq("id", id).single();
    if (!cur) throw new Error("Not found");
    const newPaid = Number(cur.paid_amount) + amount;
    const total = Number(cur.total_amount);
    let status = "partial";
    if (newPaid >= total) status = "paid";
    else if (newPaid <= 0) status = "unpaid";
    const { error } = await sb.from("accounts_receivable").update({ paid_amount: newPaid, status }).eq("id", id);
    if (error) throw error;
  },
};

// ============= Accounts Payable =============
export interface Payable {
  id: string;
  vendor_id: string | null;
  vendor_name: string;
  bill_no: string;
  reference_po_id: string | null;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export const payablesRepo = {
  async list(status?: string): Promise<Payable[]> {
    let q = sb.from("accounts_payable").select("*").order("due_date", { ascending: true });
    if (status && status !== "all") q = q.eq("status", status);
    const { data } = await q;
    return (data ?? []) as Payable[];
  },
  async create(input: Partial<Payable>) {
    const { error } = await sb.from("accounts_payable").insert(input);
    if (error) throw error;
  },
  async recordPayment(id: string, amount: number) {
    const { data: cur } = await sb.from("accounts_payable").select("paid_amount,total_amount").eq("id", id).single();
    if (!cur) throw new Error("Not found");
    const newPaid = Number(cur.paid_amount) + amount;
    const total = Number(cur.total_amount);
    let status = "partial";
    if (newPaid >= total) status = "paid";
    else if (newPaid <= 0) status = "unpaid";
    const { error } = await sb.from("accounts_payable").update({ paid_amount: newPaid, status }).eq("id", id);
    if (error) throw error;
  },
};

export function deriveStatus(due_date: string | null, status: string): "paid" | "overdue" | "due_soon" | "unpaid" | "partial" {
  if (status === "paid") return "paid";
  if (!due_date) return (status as any) ?? "unpaid";
  const d = new Date(due_date).getTime();
  const now = Date.now();
  if (d < now) return "overdue";
  if (d - now < 1000 * 60 * 60 * 24 * 7) return "due_soon";
  return (status as any) ?? "unpaid";
}
