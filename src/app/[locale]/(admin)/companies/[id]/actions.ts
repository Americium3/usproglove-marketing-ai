"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { checkAdmin } from "@/lib/auth/admin";

type ActionResult = { ok: true } | { ok: false; error: string };

const NoteSchema = z.object({
  companyId: z.string().uuid(),
  prospectId: z.string().uuid().nullable().optional(),
  body: z.string().min(1).max(10000),
});

export async function addNoteAction(input: z.infer<typeof NoteSchema>): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };
  const parsed = NoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  await db.insert(schema.crmNotes).values({
    companyId: parsed.data.companyId,
    prospectId: parsed.data.prospectId ?? null,
    authorEmail: auth.email,
    body: parsed.data.body.trim(),
  });

  revalidatePath(`/[locale]/companies/${parsed.data.companyId}`, "page");
  if (parsed.data.prospectId) {
    revalidatePath(`/[locale]/prospects/${parsed.data.prospectId}`, "page");
  }
  return { ok: true };
}

export async function deleteNoteAction(input: { id: string; companyId: string; prospectId?: string | null }): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };
  await db.delete(schema.crmNotes).where(eq(schema.crmNotes.id, input.id));
  revalidatePath(`/[locale]/companies/${input.companyId}`, "page");
  if (input.prospectId) revalidatePath(`/[locale]/prospects/${input.prospectId}`, "page");
  return { ok: true };
}

const TaskCreateSchema = z.object({
  companyId: z.string().uuid(),
  prospectId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  body: z.string().max(5000).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export async function addTaskAction(input: z.infer<typeof TaskCreateSchema>): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };
  const parsed = TaskCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  await db.insert(schema.crmTasks).values({
    companyId: parsed.data.companyId,
    prospectId: parsed.data.prospectId ?? null,
    title: parsed.data.title.trim(),
    body: parsed.data.body?.trim() || null,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    assigneeEmail: auth.email,
    createdByEmail: auth.email,
  });

  revalidatePath(`/[locale]/companies/${parsed.data.companyId}`, "page");
  if (parsed.data.prospectId) revalidatePath(`/[locale]/prospects/${parsed.data.prospectId}`, "page");
  return { ok: true };
}

const TaskStatus = z.enum(["open", "done", "snoozed", "cancelled"]);

export async function updateTaskStatusAction(input: { id: string; status: z.infer<typeof TaskStatus>; companyId: string; prospectId?: string | null }): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };
  const status = TaskStatus.safeParse(input.status);
  if (!status.success) return { ok: false, error: "invalid_status" };

  await db
    .update(schema.crmTasks)
    .set({
      status: status.data,
      completedAt: status.data === "done" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.crmTasks.id, input.id));

  revalidatePath(`/[locale]/companies/${input.companyId}`, "page");
  if (input.prospectId) revalidatePath(`/[locale]/prospects/${input.prospectId}`, "page");
  return { ok: true };
}

export async function deleteTaskAction(input: { id: string; companyId: string; prospectId?: string | null }): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };
  await db.delete(schema.crmTasks).where(eq(schema.crmTasks.id, input.id));
  revalidatePath(`/[locale]/companies/${input.companyId}`, "page");
  if (input.prospectId) revalidatePath(`/[locale]/prospects/${input.prospectId}`, "page");
  return { ok: true };
}

const DealStage = z.enum(["lead", "qualified", "opportunity", "customer", "closed_lost"]);

export async function updateDealStageAction(input: { companyId: string; stage: z.infer<typeof DealStage> }): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };
  const stage = DealStage.safeParse(input.stage);
  if (!stage.success) return { ok: false, error: "invalid_stage" };

  await db
    .update(schema.companies)
    .set({ dealStage: stage.data, updatedAt: new Date() })
    .where(eq(schema.companies.id, input.companyId));

  revalidatePath(`/[locale]/companies/${input.companyId}`, "page");
  revalidatePath(`/[locale]/companies`, "page");
  return { ok: true };
}

const BackgroundSchema = z.object({
  companyId: z.string().uuid(),
  background: z.string().max(20000),
});

export async function updateBackgroundAction(input: z.infer<typeof BackgroundSchema>): Promise<ActionResult> {
  const auth = await checkAdmin();
  if (!auth.ok) return { ok: false, error: "unauthorized" };
  const parsed = BackgroundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  await db
    .update(schema.companies)
    .set({ background: parsed.data.background.trim() || null, updatedAt: new Date() })
    .where(eq(schema.companies.id, parsed.data.companyId));

  revalidatePath(`/[locale]/companies/${parsed.data.companyId}`, "page");
  return { ok: true };
}
