import { ArrowUpRight, Instagram } from "lucide-react";

export default async function MobileInstagramReturn({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const ar = locale === "ar";
  // OAuth state/code/token stay on the API. No query parameter can choose the native destination or assert success.
  return (
    <main className="sunlit-theme flex min-h-dvh items-center justify-center bg-[var(--background)] p-6 text-[var(--text)]">
      <section className="w-full max-w-lg space-y-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7 sm:p-10">
        <p className="font-semibold">MARKOS AI</p>
        <Instagram aria-hidden="true" className="h-9 w-9 text-[var(--primary)]" />
        <h1 className="text-3xl font-semibold">{ar ? "المتابعة في ماركوس" : "Continue in MARKOS"}</h1>
        <p>
          {ar
            ? "عد إلى التطبيق للتحقّق من اتصال إنستغرام. إذا ألغيت الموافقة، يمكنك المحاولة مجددًا من هناك."
            : "Return to the app to check your Instagram connection. If you cancelled consent, you can try again from there."}
        </p>
        <a
          href="markos:///instagram"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--on-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {ar ? "فتح ماركوس" : "Open MARKOS"}
          <ArrowUpRight aria-hidden="true" size={20} />
        </a>
        <p className="text-sm text-[var(--text-muted)]">
          {ar
            ? "إذا لم يفتح التطبيق، انتقل إليه يدويًا ثم افتح الإعدادات ← إنستغرام ← التحقّق من الحالة."
            : "If the app doesn’t open, switch to MARKOS manually and open Settings → Instagram → Check status."}
        </p>
      </section>
    </main>
  );
}
