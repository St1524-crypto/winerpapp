import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ Company Settings ============
export const getCompanySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("quote_company_settings")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const upsertCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async ({ data, context }) => {
    // determine company_id
    const { data: prof } = await context.supabase
      .from("profiles").select("current_company_id").eq("id", context.userId).maybeSingle();
    const company_id = (data.company_id as string) ?? prof?.current_company_id;
    if (!company_id) throw new Error("no company");
    const payload = { ...data, company_id };
    const { data: row, error } = await context.supabase
      .from("quote_company_settings")
      .upsert(payload as never, { onConflict: "company_id" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

// ============ Bank Accounts ============
export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("quote_bank_accounts")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async ({ data, context }) => {
    const { data: prof } = await context.supabase
      .from("profiles").select("current_company_id").eq("id", context.userId).maybeSingle();
    const company_id = (data.company_id as string) ?? prof?.current_company_id;
    if (!company_id) throw new Error("no company");
    const payload = { ...data, company_id };
    if (payload.id) {
      const { id, ...rest } = payload as { id: string };
      const { data: row, error } = await context.supabase
        .from("quote_bank_accounts").update(rest as never).eq("id", id).select().single();
      if (error) throw error;
      if ((payload as { is_default?: boolean }).is_default) {
        await context.supabase.from("quote_bank_accounts")
          .update({ is_default: false } as never).neq("id", id).eq("company_id", company_id);
      }
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("quote_bank_accounts").insert(payload as never).select().single();
    if (error) throw error;
    if ((payload as { is_default?: boolean }).is_default && row) {
      await context.supabase.from("quote_bank_accounts")
        .update({ is_default: false } as never).neq("id", (row as { id: string }).id).eq("company_id", company_id);
    }
    return row;
  });

export const deleteBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("quote_bank_accounts").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ Quotes ============
type QuoteItemInput = {
  product_id?: string | null;
  item_name: string;
  spec?: string | null;
  quantity: number;
  unit_price: number;
  discount?: number;
  subtotal?: number;
  sort_order?: number;
};

type QuoteInput = {
  id?: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  quote_date?: string;
  valid_until?: string | null;
  salesperson_id?: string | null;
  salesperson_name?: string | null;
  status?: string;
  bank_account_id?: string | null;
  notes?: string | null;
  payment_terms?: string | null;
  discount_amount?: number;
  tax_amount?: number;
  items: QuoteItemInput[];
};

export const listQuotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("quotes")
      .select("id, quote_no, customer_name, quote_date, valid_until, status, total_amount, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const getQuote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: quote, error } = await context.supabase
      .from("quotes").select("*").eq("id", data.id).single();
    if (error) throw error;
    const { data: items } = await context.supabase
      .from("quote_items").select("*").eq("quote_id", data.id).order("sort_order");
    return { quote, items: items ?? [] };
  });

function genQuoteNo(): string {
  const d = new Date();
  const tz = new Date(d.getTime() + 8 * 3600 * 1000);
  const ymd = tz.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `Q${ymd}${rand}`;
}

function genToken(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const saveQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: QuoteInput) => d)
  .handler(async ({ data, context }) => {
    const { data: prof } = await context.supabase
      .from("profiles").select("current_company_id, name, email").eq("id", context.userId).maybeSingle();
    const company_id = prof?.current_company_id;
    if (!company_id) throw new Error("no company");

    // snapshots
    const { data: settings } = await context.supabase
      .from("quote_company_settings").select("*").eq("company_id", company_id).maybeSingle();
    let bank_snapshot: Record<string, unknown> = {};
    if (data.bank_account_id) {
      const { data: bank } = await context.supabase
        .from("quote_bank_accounts").select("*").eq("id", data.bank_account_id).maybeSingle();
      if (bank) bank_snapshot = bank as Record<string, unknown>;
    }

    // compute totals
    const items = data.items.map((it, idx) => {
      const sub = it.subtotal ?? (it.quantity * it.unit_price - (it.discount ?? 0));
      return { ...it, subtotal: sub, sort_order: it.sort_order ?? idx };
    });
    const subtotal = items.reduce((s, it) => s + Number(it.subtotal), 0);
    const total = subtotal - (data.discount_amount ?? 0) + (data.tax_amount ?? 0);

    if (data.id) {
      // update
      const { data: existing } = await context.supabase
        .from("quotes").select("status, public_token").eq("id", data.id).single();
      if (existing?.status === "converted") throw new Error("quote already converted");
      const { error: uerr } = await context.supabase.from("quotes").update({
        customer_name: data.customer_name,
        customer_phone: data.customer_phone ?? null,
        customer_email: data.customer_email ?? null,
        customer_address: data.customer_address ?? null,
        quote_date: data.quote_date,
        valid_until: data.valid_until ?? null,
        salesperson_id: data.salesperson_id ?? null,
        salesperson_name: data.salesperson_name ?? null,
        status: data.status ?? "draft",
        bank_account_id: data.bank_account_id ?? null,
        bank_snapshot,
        company_snapshot: (settings ?? {}) as never,
        subtotal,
        discount_amount: data.discount_amount ?? 0,
        tax_amount: data.tax_amount ?? 0,
        total_amount: total,
        notes: data.notes ?? null,
        payment_terms: data.payment_terms ?? null,
      } as never).eq("id", data.id);
      if (uerr) throw uerr;
      await context.supabase.from("quote_items").delete().eq("quote_id", data.id);
      const rows = items.map((it) => ({ ...it, quote_id: data.id }));
      const { error: ierr } = await context.supabase.from("quote_items").insert(rows as never);
      if (ierr) throw ierr;
      return { id: data.id };
    }

    // insert
    const quote_no = genQuoteNo();
    const public_token = genToken();
    const { data: inserted, error: insErr } = await context.supabase.from("quotes").insert({
      company_id,
      quote_no,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone ?? null,
      customer_email: data.customer_email ?? null,
      customer_address: data.customer_address ?? null,
      quote_date: data.quote_date ?? new Date().toISOString().slice(0, 10),
      valid_until: data.valid_until ?? null,
      salesperson_id: data.salesperson_id ?? context.userId,
      salesperson_name: data.salesperson_name ?? prof?.name ?? prof?.email ?? null,
      status: data.status ?? "draft",
      bank_account_id: data.bank_account_id ?? null,
      bank_snapshot,
      company_snapshot: (settings ?? {}) as never,
      subtotal,
      discount_amount: data.discount_amount ?? 0,
      tax_amount: data.tax_amount ?? 0,
      total_amount: total,
      notes: data.notes ?? null,
      payment_terms: data.payment_terms ?? null,
      public_token,
      created_by: context.userId,
    } as never).select("id").single();
    if (insErr) throw insErr;
    const newId = (inserted as { id: string }).id;
    const rows = items.map((it) => ({ ...it, quote_id: newId }));
    const { error: iErr } = await context.supabase.from("quote_items").insert(rows as never);
    if (iErr) throw iErr;
    return { id: newId };
  });

export const deleteQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: q } = await context.supabase.from("quotes").select("status").eq("id", data.id).single();
    if (q?.status === "converted") throw new Error("converted quote cannot be deleted");
    const { error } = await context.supabase.from("quotes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// public product picker
export const listProductsLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products").select("id, name, sku, price").order("name").limit(500);
    if (error) throw error;
    return data ?? [];
  });
