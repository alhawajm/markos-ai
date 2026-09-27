import { AccountDeletionSettings } from "../_components/delivery-settings";
export const metadata = { title: "Delete account | MARKOS", robots: { index: false, follow: false } };
export default async function DeleteAccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: value } = await params;
  const locale = value === "ar" ? "ar" : "en";
  return (
    <main dir={locale === "ar" ? "rtl" : "ltr"} className="mx-auto min-h-screen max-w-2xl px-5 py-12">
      <a href={`/${locale}/login`} className="text-xl font-semibold">
        MARKOS
      </a>
      <AccountDeletionSettings locale={locale} restoreSession />
    </main>
  );
}
