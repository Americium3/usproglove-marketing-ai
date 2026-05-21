"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateDealStageAction } from "../actions";

export type DealStage = "lead" | "qualified" | "opportunity" | "customer" | "closed_lost";

const STAGES: DealStage[] = ["lead", "qualified", "opportunity", "customer", "closed_lost"];

const STAGE_CLASS: Record<DealStage, string> = {
  lead: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700",
  qualified: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-300 dark:border-sky-800",
  opportunity: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800",
  customer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  closed_lost: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800",
};

export function StageBadge({ stage }: { stage: DealStage }) {
  const t = useTranslations("crm.stage");
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs ${STAGE_CLASS[stage]}`}>
      {t(stage)}
    </span>
  );
}

export function StageSelector({ companyId, current }: { companyId: string; current: DealStage }) {
  const t = useTranslations("crm.stage");
  const [pending, start] = useTransition();

  const change = (next: DealStage) => {
    if (next === current) return;
    start(async () => {
      await updateDealStageAction({ companyId, stage: next });
    });
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {STAGES.map((s) => {
        const active = s === current;
        return (
          <button
            key={s}
            type="button"
            onClick={() => change(s)}
            disabled={pending || active}
            className={`rounded border px-2 py-0.5 text-xs ${active ? STAGE_CLASS[s] : "border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"} disabled:cursor-default`}
          >
            {t(s)}
          </button>
        );
      })}
    </div>
  );
}
