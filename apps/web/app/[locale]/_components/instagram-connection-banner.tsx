"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Instagram } from "lucide-react";
import type { Locale } from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";

export function InstagramConnectionBanner({ locale }: { locale: Locale }) {
  const client = useMarkosClient(locale);
  const session = useMarkosSession();
  const [disconnected, setDisconnected] = useState(false);
  useEffect(() => {
    let active = true;
    setDisconnected(false);
    if (session)
      void client
        .instagramConnection()
        .then((connection) => {
          if (active) setDisconnected(!connection.connected);
        })
        .catch(() => {
          /* A failed status check is not evidence of disconnection. */
        });
    return () => {
      active = false;
    };
  }, [client, session]);
  if (!disconnected) return null;
  const ar = locale === "ar";
  return (
    <aside className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <Instagram aria-hidden="true" className="shrink-0 text-[var(--accent)]" size={26} />
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold">{ar ? "اربط إنستغرام لإكمال الإعداد" : "Connect Instagram to complete your setup"}</p>
        <p className="mt-1 text-[15px] text-[var(--text-muted)]">
          {ar ? "دع ماركوس يتعلم من محتواك وفعّل النشر وإحصاءات إنستغرام." : "Let MARKOS learn from your content and enable publishing and Instagram insights."}
        </p>
      </div>
      <Link
        href={`/${locale}/instagram-setup`}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--on-primary)]"
      >
        {ar ? "متابعة الإعداد" : "Continue setup"}
        <ArrowUpRight aria-hidden="true" size={18} />
      </Link>
    </aside>
  );
}
