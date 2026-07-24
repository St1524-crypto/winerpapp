import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Participants ----------
export const listParticipants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("operation_participants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const listAssignableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: parts, error } = await context.supabase
      .from("operation_participants")
      .select("user_id, department, op_role, is_active")
      .eq("is_active", true);
    if (error) throw error;
    const ids = Array.from(new Set((parts ?? []).map((p: any) => p.user_id)));
    if (ids.length === 0) return [];
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id, name, display_name, email, member_no")
      .in("id", ids);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return (parts ?? []).map((p: any) => {
      const pr: any = map.get(p.user_id) ?? {};
      const label = pr.display_name || pr.name || pr.email || pr.member_no || p.user_id;
      return { user_id: p.user_id, department: p.department, op_role: p.op_role, label };
    });
  });

export const searchMembersForGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { keyword?: string } = {}) => d)
  .handler(async ({ data, context }) => {
    const kw = (data.keyword ?? "").trim();
    let q = context.supabase
      .from("profiles")
      .select("id, name, display_name, email, member_no, phone")
      .order("created_at", { ascending: false })
      .limit(20);
    if (kw) {
      const like = `%${kw.replace(/[%_]/g, "")}%`;
      q = q.or(
        `name.ilike.${like},display_name.ilike.${like},email.ilike.${like},member_no.ilike.${like},phone.ilike.${like}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).map((p: any) => ({
      user_id: p.id,
      label: p.display_name || p.name || p.email || p.member_no || p.id,
      hint: [p.member_no, p.phone, p.email].filter(Boolean).join(" · "),
    }));
  });


export const grantParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; opRole?: "manager" | "staff" | "assistant" | "collaborator"; department?: string | null; notes?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("operation_participants")
      .upsert(
        {
          user_id: data.userId,
          op_role: data.opRole ?? "staff",
          department: data.department ?? null,
          notes: data.notes ?? null,
          is_active: true,
          granted_by: context.userId,
        },
        { onConflict: "company_id,user_id" },
      )
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const setParticipantActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; isActive: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("operation_participants")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getMyParticipantStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("operation_participants")
      .select("*")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .maybeSingle();
    return data;
  });

// ---------- Tasks ----------
export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { scope?: "all" | "mine"; status?: string } = {}) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("operation_tasks").select("*").order("created_at", { ascending: false });
    if (data.scope === "mine") q = q.eq("assignee_id", context.userId);
    if (data.status) q = q.eq("status", data.status as any);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; description?: string; assigneeId?: string | null; priority?: "low" | "normal" | "high" | "urgent"; dueAt?: string | null; department?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("operation_tasks")
      .insert({
        title: data.title,
        description: data.description ?? null,
        assignee_id: data.assigneeId ?? null,
        priority: data.priority ?? "normal",
        due_at: data.dueAt ?? null,
        department: data.department ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "pending" | "in_progress" | "submitted" | "completed" | "cancelled" }) => d)
  .handler(async ({ data, context }) => {
    const patch: any = { status: data.status };
    if (data.status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await context.supabase.from("operation_tasks").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const assignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; assigneeId: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("operation_tasks")
      .update({ assignee_id: data.assigneeId })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Reports ----------
export const listTaskReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId?: string } = {}) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("operation_task_reports").select("*").order("created_at", { ascending: false });
    if (data.taskId) q = q.eq("task_id", data.taskId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const submitTaskReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; content: string; statusSnapshot?: "pending" | "in_progress" | "submitted" | "completed" }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("operation_task_reports")
      .insert({
        task_id: data.taskId,
        reporter_id: context.userId,
        content: data.content,
        status_snapshot: data.statusSnapshot ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    if (data.statusSnapshot) {
      await context.supabase
        .from("operation_tasks")
        .update({ status: data.statusSnapshot })
        .eq("id", data.taskId);
    }
    return row;
  });

// ---------- Attendance ----------
export const punchAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { logType: "check_in" | "check_out"; note?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("operation_attendance_logs")
      .insert({
        user_id: context.userId,
        log_type: data.logType,
        note: data.note ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const listMyAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("operation_attendance_logs")
      .select("*")
      .eq("user_id", context.userId)
      .order("logged_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const listAllAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workDate?: string } = {}) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("operation_attendance_logs").select("*").order("logged_at", { ascending: false }).limit(500);
    if (data.workDate) q = q.eq("work_date", data.workDate);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ---------- AI Summary (rule-based placeholder) ----------
export const generateDailySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const todayTpe = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const [tasksRes, reportsRes, attRes] = await Promise.all([
      context.supabase.from("operation_tasks").select("id,status,due_at,assignee_id,title"),
      context.supabase.from("operation_task_reports").select("id,task_id,created_at").gte("created_at", `${todayTpe}T00:00:00Z`),
      context.supabase.from("operation_attendance_logs").select("id,user_id,log_type,logged_at").eq("work_date", todayTpe),
    ]);
    const tasks = tasksRes.data ?? [];
    const reports = reportsRes.data ?? [];
    const att = attRes.data ?? [];
    const now = Date.now();
    const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now && t.status !== "completed" && t.status !== "cancelled");
    const pending = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
    const reportedTaskIds = new Set(reports.map((r) => r.task_id));
    const unreported = pending.filter((t) => !reportedTaskIds.has(t.id));
    const checkIns = att.filter((a) => a.log_type === "check_in");
    const checkOuts = att.filter((a) => a.log_type === "check_out");
    const missingCheckout = checkIns.filter((ci) => !checkOuts.find((co) => co.user_id === ci.user_id));
    return {
      date: todayTpe,
      todo_count: pending.length,
      overdue_count: overdue.length,
      overdue_tasks: overdue.slice(0, 10),
      unreported_count: unreported.length,
      unreported_tasks: unreported.slice(0, 10),
      attendance_check_in: checkIns.length,
      attendance_check_out: checkOuts.length,
      attendance_anomaly_count: missingCheckout.length,
      summary_text: `今日待辦 ${pending.length} 件、逾期 ${overdue.length} 件、未回報 ${unreported.length} 件；打卡上班 ${checkIns.length} 人、下班 ${checkOuts.length} 人，異常 ${missingCheckout.length} 人。`,
    };
  });
