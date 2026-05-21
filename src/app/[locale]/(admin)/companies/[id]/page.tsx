import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { NotesPanel, type NoteRow } from "./_components/NotesPanel";
import { TasksPanel, type TaskRow, type TaskStatus } from "./_components/TasksPanel";
import { StageSelector, type DealStage } from "./_components/StageSelector";
import { BackgroundEditor } from "./_components/BackgroundEditor";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("crm.detail");
  const tStatus = await getTranslations("prospects.statusFilter");
  const format = await getFormatter();

  const [company] = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.id, id))
    .limit(1);
  if (!company) notFound();

  const prospects = await db
    .select()
    .from(schema.prospects)
    .where(eq(schema.prospects.companyId, id))
    .orderBy(desc(schema.prospects.updatedAt));

  const prospectIds = prospects.map((p) => p.id);
  const prospectLabels = new Map<string, string>(
    prospects.map((p) => [
      p.id,
      [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email,
    ]),
  );

  const [notes, tasks, messages, events] = await Promise.all([
    db
      .select()
      .from(schema.crmNotes)
      .where(eq(schema.crmNotes.companyId, id))
      .orderBy(desc(schema.crmNotes.createdAt)),
    db
      .select()
      .from(schema.crmTasks)
      .where(eq(schema.crmTasks.companyId, id))
      .orderBy(asc(schema.crmTasks.dueAt), desc(schema.crmTasks.createdAt)),
    prospectIds.length > 0
      ? db
          .select()
          .from(schema.messages)
          .where(inArray(schema.messages.prospectId, prospectIds))
          .orderBy(desc(schema.messages.createdAt))
      : Promise.resolve([] as (typeof schema.messages.$inferSelect)[]),
    prospectIds.length > 0
      ? db
          .select()
          .from(schema.events)
          .where(inArray(schema.events.prospectId, prospectIds))
          .orderBy(desc(schema.events.createdAt))
          .limit(50)
      : Promise.resolve([] as (typeof schema.events.$inferSelect)[]),
  ]);

  const noteRows: NoteRow[] = notes.map((n) => ({
    id: n.id,
    body: n.body,
    authorEmail: n.authorEmail,
    createdAt: n.createdAt,
    prospectId: n.prospectId,
    prospectLabel: n.prospectId ? prospectLabels.get(n.prospectId) ?? null : null,
  }));

  const taskRows: TaskRow[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    body: task.body,
    status: task.status as TaskStatus,
    dueAt: task.dueAt,
    createdAt: task.createdAt,
    createdByEmail: task.createdByEmail,
    prospectId: task.prospectId,
    prospectLabel: task.prospectId ? prospectLabels.get(task.prospectId) ?? null : null,
  }));

  const lastActivity =
    messages[0]?.createdAt ?? events[0]?.createdAt ?? notes[0]?.createdAt ?? company.updatedAt;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <Link
          href="/companies"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← {t("back")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          <span className="text-xs text-neutral-500">{company.vertical}</span>
        </div>
        <div className="mt-2 text-sm text-neutral-500">
          {[company.city, company.region, company.countryCode].filter(Boolean).join(" · ")}
        </div>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title={t("contact")}>
          <Row label={t("website")}>
            {company.website ? (
              <a
                href={company.website}
                target="_blank"
                rel="noreferrer noopener"
                className="underline break-all"
              >
                {company.website}
              </a>
            ) : (
              "—"
            )}
          </Row>
          <Row label={t("phone")}>{company.phone || "—"}</Row>
          <Row label={t("address")}>
            {[company.addressLine, company.city, company.region].filter(Boolean).join(", ") || "—"}
          </Row>
        </Card>

        <Card title={t("meta")}>
          <Row label={t("vertical")}>{company.vertical}</Row>
          <Row label={t("subVertical")}>{company.subVertical || "—"}</Row>
          <Row label={t("rating")}>
            {company.rating != null ? `${(company.rating / 10).toFixed(1)} (${company.reviewCount ?? 0})` : "—"}
          </Row>
          <Row label={t("lastActivity")}>
            {format.dateTime(lastActivity, { dateStyle: "short", timeStyle: "short" })}
          </Row>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("dealStage")}</h2>
        <StageSelector companyId={company.id} current={company.dealStage as DealStage} />
      </section>

      <BackgroundEditor companyId={company.id} initial={company.background} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("contacts")}</h2>
          <span className="text-xs text-neutral-500">{prospects.length}</span>
        </div>
        {prospects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500">
            {t("contactsEmpty")}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-800">
            {prospects.map((p) => {
              const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
              return (
                <li key={p.id}>
                  <Link
                    href={`/prospects/${p.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {name || p.email}
                        {p.role && <span className="ml-2 text-xs text-neutral-500">{p.role}</span>}
                      </div>
                      <div className="text-xs text-neutral-500 truncate">{p.email}</div>
                    </div>
                    <span className="text-xs text-neutral-500 whitespace-nowrap">
                      {tStatus(p.status)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <NotesPanel companyId={company.id} notes={noteRows} />

      <TasksPanel companyId={company.id} tasks={taskRows} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("timeline")}</h2>
        {messages.length === 0 && events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500">
            {t("timelineEmpty")}
          </div>
        ) : (
          <ol className="relative border-l border-neutral-200 dark:border-neutral-800 ml-2 space-y-4">
            {[
              ...messages.map((m) => ({
                kind: "message" as const,
                ts: m.sentAt ?? m.createdAt,
                payload: m,
              })),
              ...events.map((e) => ({
                kind: "event" as const,
                ts: e.createdAt,
                payload: e,
              })),
            ]
              .sort((a, b) => b.ts.getTime() - a.ts.getTime())
              .slice(0, 50)
              .map((entry, i) => (
                <li key={`${entry.kind}-${i}`} className="pl-4 relative">
                  <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-neutral-400 dark:bg-neutral-600" />
                  <div className="text-xs text-neutral-500">
                    {format.dateTime(entry.ts, { dateStyle: "short", timeStyle: "short" })}
                    {entry.payload.prospectId && prospectLabels.get(entry.payload.prospectId) && (
                      <>
                        {" · "}
                        <Link
                          href={`/prospects/${entry.payload.prospectId}`}
                          className="text-neutral-400 underline hover:text-neutral-700 dark:hover:text-neutral-300"
                        >
                          {prospectLabels.get(entry.payload.prospectId)}
                        </Link>
                      </>
                    )}
                  </div>
                  {entry.kind === "message" ? (
                    <div className="text-sm">
                      <span className="font-medium">{entry.payload.direction}</span>
                      {" · "}
                      <span>{entry.payload.subject}</span>
                    </div>
                  ) : (
                    <div className="text-sm font-medium">{entry.payload.kind}</div>
                  )}
                </li>
              ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
      <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm py-1">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <span className="text-right break-all">{children}</span>
    </div>
  );
}
