import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/expire-group-buys")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("group_buys")
          .update({ status: "expired" })
          .lt("expires_at", new Date().toISOString())
          .eq("status", "open")
          .select("id");
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ expired: data?.length ?? 0 });
      },
    },
  },
});
