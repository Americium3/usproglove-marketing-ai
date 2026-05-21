"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createCampaign,
  updateCampaign,
  type CreateCampaignState,
} from "../actions";
import { products, heroSkuByVertical, type Vertical } from "@/../content/catalog/products";
import type { IcpConfig } from "@/lib/workflow/icp";

type Option = { value: string; label: string };

const VERTICAL_OPTIONS: Vertical[] = [
  "tattoo",
  "beauty",
  "restaurant",
  "medical",
  "industrial",
  "automotive",
  "agriculture",
  "janitorial",
  "cannabis",
  "veterinary",
];

const STATUS_OPTIONS = ["draft", "active", "paused", "archived"] as const;

export interface CampaignFormDefaults {
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  signatureText?: string;
  dailyCap: number;
  contactsPerCompany: number;
  // optional for create; populated for edit
  id?: string;
  name?: string;
  vertical?: Vertical;
  heroSkuId?: string;
  status?: (typeof STATUS_OPTIONS)[number];
  icp?: IcpConfig | null;
}

export function CampaignForm({
  mode,
  defaults,
}: {
  mode: "create" | "edit";
  defaults: CampaignFormDefaults;
}) {
  const t = useTranslations("campaigns.form");
  const tv = useTranslations("verticals");
  const ts = useTranslations("campaigns.status");

  const action = mode === "edit" ? updateCampaign : createCampaign;
  const [state, formAction, pending] = useActionState<CreateCampaignState, FormData>(
    action,
    { ok: false },
  );

  const initialVertical: Vertical = defaults.vertical ?? "restaurant";
  const [vertical, setVertical] = useState<Vertical>(initialVertical);
  const [heroSkuId, setHeroSkuId] = useState<string>(
    defaults.heroSkuId ?? heroSkuByVertical[initialVertical],
  );

  const verticalOpts: Option[] = VERTICAL_OPTIONS.map((v) => ({ value: v, label: safeT(tv, v, v) }));
  const skuOpts: Option[] = products.map((p) => ({ value: p.id, label: `${p.id} — ${p.name}` }));
  const statusOpts: Option[] = STATUS_OPTIONS.map((s) => ({ value: s, label: safeT(ts, s, s) }));

  const err = state.fieldErrors ?? {};

  const icp = defaults.icp ?? {};
  const joinList = (xs: string[] | undefined) => (xs && xs.length ? xs.join(", ") : "");

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      {mode === "edit" && defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <Field label={t("name")} error={err.name?.[0]}>
        <input
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={defaults.name ?? ""}
          placeholder={t("namePlaceholder")}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("vertical")} error={err.vertical?.[0]}>
          <select
            name="vertical"
            value={vertical}
            onChange={(e) => {
              const v = e.target.value as Vertical;
              setVertical(v);
              setHeroSkuId(heroSkuByVertical[v]);
            }}
            className={inputClass}
          >
            {verticalOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("sku")} error={err.heroSkuId?.[0]}>
          <select
            name="heroSkuId"
            value={heroSkuId}
            onChange={(e) => setHeroSkuId(e.target.value)}
            className={inputClass}
          >
            {skuOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label={t("dailyCap")} error={err.dailyCap?.[0]}>
          <input
            type="number"
            name="dailyCap"
            defaultValue={defaults.dailyCap}
            min={1}
            max={500}
            className={inputClass}
          />
        </Field>

        <Field label={t("contactsPerCompany")} error={err.contactsPerCompany?.[0]}>
          <input
            type="number"
            name="contactsPerCompany"
            defaultValue={defaults.contactsPerCompany}
            min={1}
            max={10}
            className={inputClass}
          />
        </Field>

        <Field label={t("status")} error={err.status?.[0]}>
          <select name="status" defaultValue={defaults.status ?? "draft"} className={inputClass}>
            {statusOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("senderEmail")} error={err.senderEmail?.[0]}>
          <input type="email" name="senderEmail" defaultValue={defaults.senderEmail} required className={inputClass} />
        </Field>
        <Field label={t("senderName")} error={err.senderName?.[0]}>
          <input name="senderName" defaultValue={defaults.senderName} required className={inputClass} />
        </Field>
      </div>

      <Field label={t("replyToEmail")} error={err.replyToEmail?.[0]}>
        <input type="email" name="replyToEmail" defaultValue={defaults.replyToEmail} required className={inputClass} />
      </Field>

      <Field label={t("signatureText")} error={err.signatureText?.[0]}>
        <textarea
          name="signatureText"
          rows={5}
          maxLength={2000}
          defaultValue={defaults.signatureText ?? ""}
          placeholder={t("signaturePlaceholder")}
          className={`${inputClass} font-mono`}
        />
        <span className="block text-xs text-neutral-500 mt-1">{t("signatureHint")}</span>
      </Field>

      <fieldset className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-4">
        <legend className="px-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          {t("icpSectionTitle")}
        </legend>

        <Field label={t("icpDescription")} error={err.icpDescription?.[0]}>
          <textarea
            name="icpDescription"
            rows={4}
            maxLength={2000}
            defaultValue={icp.description ?? ""}
            placeholder={t("icpDescriptionPlaceholder")}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("icpCities")} error={err.icpCities?.[0]}>
            <input
              name="icpCities"
              defaultValue={joinList(icp.cities)}
              placeholder="San Francisco, Oakland"
              className={inputClass}
            />
          </Field>
          <Field label={t("icpExcludeKeywords")} error={err.icpExcludeKeywords?.[0]}>
            <input
              name="icpExcludeKeywords"
              defaultValue={joinList(icp.excludeKeywords)}
              placeholder="hospital, pharmacy"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label={t("icpMinReviews")} error={err.icpMinReviews?.[0]}>
            <input
              type="number"
              name="icpMinReviews"
              defaultValue={icp.minReviewCount ?? ""}
              min={0}
              max={10000}
              className={inputClass}
            />
          </Field>
          <Field label={t("icpMinRating")} error={err.icpMinRating?.[0]}>
            <input
              type="number"
              step="0.1"
              name="icpMinRating"
              defaultValue={icp.minRating ?? ""}
              min={0}
              max={5}
              className={inputClass}
            />
          </Field>
          <Field label={t("icpPreferredRoles")} error={err.icpPreferredRoles?.[0]}>
            <input
              name="icpPreferredRoles"
              defaultValue={joinList(icp.preferredRoles)}
              placeholder="owner, practice manager"
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      {state.error === "forbidden" && (
        <p className="text-sm text-red-600">{t("errorForbidden")}</p>
      )}
      {state.error && state.error !== "forbidden" && state.error !== "invalid" && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-4 py-2 text-sm disabled:opacity-50"
        >
          {pending
            ? t("saving")
            : mode === "edit"
              ? t("update")
              : t("submit")}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function safeT(
  t: (k: string) => string,
  key: string,
  fallback: string,
): string {
  try {
    const v = t(key);
    return v && v !== key ? v : fallback;
  } catch {
    return fallback;
  }
}
