import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("public");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold">USProGlove</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/industries/medical" className="hover:underline">{t("nav.industries")}</Link>
            <Link href="/blog/tattoo" className="hover:underline">{t("nav.blog")}</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-6 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} USProGlove. {t("footer.tagline")}
      </footer>
    </div>
  );
}
