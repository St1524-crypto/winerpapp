import { createServerFn } from "@tanstack/react-start";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const uploadBrandingLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      fileName: z.string().min(1).max(255),
      contentType: z.string().regex(/^image\//),
      base64: z.string().min(1).max(8_000_000),
      folder: z.enum(["companies", "logos"]).default("companies"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["super_admin", "admin"])
      .limit(1);

    if (roleError) throw roleError;
    if (!roles?.length) throw new Error("您沒有上傳 Logo 的權限（需 super_admin 或 admin）");

    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("圖片需小於 5MB");

    const safeName = data.fileName.toLowerCase().replace(/[^a-z0-9.\-_]/g, "_");
    const fallbackExt = data.contentType.split("/")[1]?.replace("svg+xml", "svg") || "png";
    const ext = safeName.split(".").pop() || fallbackExt;
    const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const path = `${data.folder}/${rand}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("branding")
      .upload(path, bytes, { contentType: data.contentType, cacheControl: "3600", upsert: false });

    if (uploadError) throw uploadError;

    const { data: pub } = supabaseAdmin.storage.from("branding").getPublicUrl(path);
    return { path, publicUrl: pub.publicUrl };
  });