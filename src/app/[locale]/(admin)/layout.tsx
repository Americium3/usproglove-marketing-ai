import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth/admin";
import { LocaleSwitcher } from "./_components/LocaleSwitcher";
import { AssistantWidget } from "./_components/AssistantWidget";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const check = await checkAdmin();
  if (!check.ok && check.reason === "unauthenticated") {
    const returnTo = locale === "en" ? "/dashboard" : `/${locale}/dashboard`;
    redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const t = await getTranslations("nav");
  const tAuth = await getTranslations("auth");

  if (!check.ok) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar email={null} name={null} />
        <main className="flex-1 p-6 sm:p-10">
          <div className="max-w-md mx-auto mt-16 rounded-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center space-y-4">
            <h1 className="text-xl font-semibold">{tAuth("forbiddenTitle")}</h1>
            <p className="text-sm text-neutral-500">{tAuth("forbiddenDesc")}</p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/auth/logout"
              className="inline-block rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-4 py-2 text-sm"
            >
              {tAuth("signOut")}
            </a>
          </div>
        </main>
      </div>
    );
  }

  const links: Array<[string, string]> = [
    ["/dashboard", t("dashboard")],
    ["/campaigns", t("campaigns")],
    ["/prospects", t("prospects")],
    ["/replies", t("replies")],
    ["/content", t("content")],
    ["/social", t("social")],
    ["/ads", t("ads")],
    ["/knowledge", t("knowledge")],
    ["/cron", t("cron")],
    ["/faq", t("faq")],
  ];

  return (
    <div className="flex flex-1 flex-col">
      <TopBar email={check.email} name={check.name} signOutLabel={tAuth("signOut")} signedInLabel={tAuth("signedInAs")} />
      <div className="flex flex-1 flex-col sm:flex-row">
        <aside className="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-neutral-200 dark:border-neutral-800 p-4 sm:p-6">
          <nav className="flex sm:flex-col gap-1 overflow-x-auto">
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="rounded px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900 whitespace-nowrap"
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-6 sm:p-10">{children}</main>
      </div>
      <AssistantWidget />
    </div>
  );
}

function TopBar({
  email,
  name,
  signOutLabel,
  signedInLabel,
}: {
  email: string | null;
  name: string | null;
  signOutLabel?: string;
  signedInLabel?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-3">
      <Link href="/dashboard" className="text-sm font-semibold">
        USProGlove
      </Link>
      <div className="flex items-center gap-3">
        <LocaleSwitcher />
        {email && (
          <>
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-xs text-neutral-500">{signedInLabel}</span>
              <span className="text-xs font-medium truncate max-w-[180px]" title={email}>
                {name || email}
              </span>
            </div>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/auth/logout"
              className="rounded border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              {signOutLabel}
            </a>
          </>
        )}
      </div>
    </header>
  );
}
