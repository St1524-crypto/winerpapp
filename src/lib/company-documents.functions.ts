import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizePostgrestPattern } from "@/lib/postgrest-sanitize";

const BUCKET = "company-documents";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("admin")) {
    throw new Error("Forbidden");
  }
}

async function currentCompanyId(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("current_company_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.current_company_id ?? null;
}

/** 後台：文件清單（含可見人數、開啟次數） */
export const adminListDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const companyId = await currentCompanyId(context.userId);
    let q = supabaseAdmin
      .from("company_documents")
      .select("id, title, description, body, file_path, file_name, file_size, is_active, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const docs = data ?? [];
    const ids = docs.map((d) => d.id);
    const counts: Record<string, { viewers: number; opens: number }> = {};
    for (const id of ids) counts[id] = { viewers: 0, opens: 0 };
    if (ids.length) {
      const [{ data: viewers }, { data: logs }] = await Promise.all([
        supabaseAdmin.from("company_document_viewers").select("document_id").in("document_id", ids),
        supabaseAdmin.from("company_document_access_logs").select("document_id").in("document_id", ids),
      ]);
      for (const v of viewers ?? []) counts[v.document_id]!.viewers += 1;
      for (const l of logs ?? []) counts[l.document_id]!.opens += 1;
    }
    return docs.map((d) => ({ ...d, viewerCount: counts[d.id]?.viewers ?? 0, openCount: counts[d.id]?.opens ?? 0 }));
  });

/** 後台：新增 / 更新文件 */
export const adminSaveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(1000).optional().nullable(),
        body: z.string().max(50000).optional().nullable(),
        filePath: z.string().max(500).optional().nullable(),
        fileName: z.string().max(300).optional().nullable(),
        fileSize: z.number().int().nonnegative().optional().nullable(),
        isActive: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const companyId = await currentCompanyId(context.userId);
    if (!companyId) throw new Error("找不到目前公司");
    const payload = {
      company_id: companyId,
      title: data.title,
      description: data.description ?? null,
      body: data.body ?? null,
      file_path: data.filePath ?? null,
      file_name: data.fileName ?? null,
      file_size: data.fileSize ?? null,
      is_active: data.isActive,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("company_documents")
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return { ok: true as const, id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("company_documents")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id };
  });

export const adminDeleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const companyId = await currentCompanyId(context.userId);
    const { data: doc } = await supabaseAdmin
      .from("company_documents")
      .select("file_path, company_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc || (companyId && doc.company_id !== companyId)) throw new Error("找不到文件");
    if (doc.file_path) await supabaseAdmin.storage.from(BUCKET).remove([doc.file_path]).catch(() => {});
    const { error } = await supabaseAdmin.from("company_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** 後台：取得檔案上傳網址（私有 bucket） */
export const adminCreateUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ fileName: z.string().trim().min(1).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const companyId = await currentCompanyId(context.userId);
    if (!companyId) throw new Error("找不到目前公司");
    const safe = data.fileName.replace(/[^\w.\-\u4e00-\u9fff]/g, "_");
    const path = `${companyId}/${Date.now()}-${safe}`;
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "無法建立上傳連結");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

/** 後台：可見名單 */
export const adminListViewers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows } = await supabaseAdmin
      .from("company_document_viewers")
      .select("id, user_id, created_at")
      .eq("document_id", data.documentId)
      .order("created_at", { ascending: false });
    const ids = (rows ?? []).map((r) => r.user_id);
    const profiles = ids.length
      ? (await supabaseAdmin.from("profiles").select("id, name, member_no, phone").in("id", ids)).data ?? []
      : [];
    const map = new Map(profiles.map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      createdAt: r.created_at,
      name: map.get(r.user_id)?.name ?? "—",
      memberNo: map.get(r.user_id)?.member_no ?? "—",
      phone: map.get(r.user_id)?.phone ?? "",
    }));
  });

export const adminSearchMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ keyword: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const companyId = await currentCompanyId(context.userId);
    const kw = sanitizePostgrestPattern(data.keyword);
    let q = supabaseAdmin
      .from("profiles")
      .select("id, name, member_no, phone")
      .or(`name.ilike.%${kw}%,member_no.ilike.%${kw}%,phone.ilike.%${kw}%`)
      .limit(20);
    if (companyId) q = q.eq("current_company_id", companyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminAddViewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ documentId: z.string().uuid(), userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("company_document_viewers")
      .upsert({ document_id: data.documentId, user_id: data.userId }, { onConflict: "document_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminRemoveViewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("company_document_viewers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** 後台：開啟紀錄（誰、何時） */
export const adminListAccessLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ documentId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const companyId = await currentCompanyId(context.userId);
    let docIds: string[] | null = null;
    if (companyId) {
      const { data: docs } = await supabaseAdmin
        .from("company_documents")
        .select("id")
        .eq("company_id", companyId);
      docIds = (docs ?? []).map((d) => d.id);
      if (!docIds.length) return [];
    }
    let q = supabaseAdmin
      .from("company_document_access_logs")
      .select("id, document_id, user_id, member_no, member_name, accessed_at")
      .order("accessed_at", { ascending: false })
      .limit(500);
    if (data.documentId) q = q.eq("document_id", data.documentId);
    else if (docIds) q = q.in("document_id", docIds);
    const { data: logs, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((logs ?? []).map((l) => l.document_id)));
    const titles = ids.length
      ? (await supabaseAdmin.from("company_documents").select("id, title").in("id", ids)).data ?? []
      : [];
    const titleMap = new Map(titles.map((t) => [t.id, t.title]));
    return (logs ?? []).map((l) => ({
      id: l.id,
      documentId: l.document_id,
      documentTitle: titleMap.get(l.document_id) ?? "（已刪除）",
      memberNo: l.member_no ?? "—",
      memberName: l.member_name ?? "—",
      accessedAt: l.accessed_at,
    }));
  });

/** 會員：我可以看的文件（不含內容） */
export const listMyDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: viewers } = await supabaseAdmin
      .from("company_document_viewers")
      .select("document_id")
      .eq("user_id", context.userId);
    const ids = (viewers ?? []).map((v) => v.document_id);
    if (!ids.length) return [];
    const { data: docs } = await supabaseAdmin
      .from("company_documents")
      .select("id, title, description, file_name, is_active, updated_at")
      .in("id", ids)
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    return docs ?? [];
  });

/** 會員：輸入本人登入密碼後開啟文件，並記錄開啟人與時間 */
export const openDocumentWithPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        password: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: viewer } = await supabaseAdmin
      .from("company_document_viewers")
      .select("id")
      .eq("document_id", data.documentId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!viewer) return { ok: false as const, error: "no_access" };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, name, member_no")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.email) return { ok: false as const, error: "no_email" };

    const verifyClient = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
    );
    const { data: signIn, error: signInError } = await verifyClient.auth.signInWithPassword({
      email: profile.email,
      password: data.password,
    });
    if (signInError || signIn.user?.id !== context.userId) {
      return { ok: false as const, error: "invalid_password" };
    }

    const { data: doc } = await supabaseAdmin
      .from("company_documents")
      .select("id, title, description, body, file_path, file_name, is_active")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc || !doc.is_active) return { ok: false as const, error: "not_found" };

    await supabaseAdmin.from("company_document_access_logs").insert({
      document_id: doc.id,
      user_id: context.userId,
      member_no: profile.member_no ?? null,
      member_name: profile.name ?? null,
    });

    let fileUrl: string | null = null;
    if (doc.file_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(doc.file_path, 60 * 10);
      fileUrl = signed?.signedUrl ?? null;
    }

    return {
      ok: true as const,
      document: {
        id: doc.id,
        title: doc.title,
        description: doc.description,
        body: doc.body,
        fileName: doc.file_name,
        fileUrl,
      },
    };
  });
