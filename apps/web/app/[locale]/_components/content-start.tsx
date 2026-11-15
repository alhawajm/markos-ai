"use client";
import { useEffect, useState } from "react";
import type { ContentRecord, ContentType, Locale } from "@markos/shared-types";
import { useMarkosClient } from "./browser-session";
import { WorkspaceAssistant } from "./workspace-assistant";
import { ContentStatusBadge } from "./content-status-badge";

export function ContentStart({ locale, onOpen }: { locale: Locale; onOpen: (id: string) => void }) {
  const api = useMarkosClient(locale),
    ar = locale === "ar";
  const [items, setItems] = useState<ContentRecord[] | null>(null),
    [type, setType] = useState<ContentType>("POST"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void api
      .contentItems()
      .then((rows) => {
        if (live) setItems(rows);
      })
      .catch(() => {
        if (live) setError(ar ? "تعذّر تحميل المحتوى المحفوظ. حدّث الصفحة للمحاولة." : "Couldn’t load saved content. Refresh to retry.");
      });
    return () => {
      live = false;
    };
  }, [api, ar]);
  async function blank() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onOpen((await api.createContent({ contentType: type })).id);
    } catch {
      setError(ar ? "تعذّر فتح المسودة. حاول مجددًا." : "Couldn’t open the draft. Try again.");
      setBusy(false);
    }
  }
  return (
    <div className="task-entry">
      <WorkspaceAssistant locale={locale} intent="CONTENT" />
      <div className="task-secondary">
        <details className="task-library">
          <summary>
            {ar ? "محتواك المحفوظ" : "Your saved content"}
            {items?.length ? ` (${items.length})` : ""}
          </summary>
          {items === null && !error ? (
            <p>{ar ? "جارٍ التحميل…" : "Loading…"}</p>
          ) : !items?.length ? (
            <p>{ar ? "ستظهر مسوداتك ومنشوراتك هنا." : "Your drafts and posts will appear here."}</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button onClick={() => onOpen(item.id)}>
                    <span>{item.brief || item.caption || (ar ? "مسودة بلا عنوان" : "Untitled draft")}</span>
                    <ContentStatusBadge status={item.status} locale={locale} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>
        <details className="task-library">
          <summary>{ar ? "البدء يدويًا" : "Start manually"}</summary>
          <div className="task-manual">
            <label>
              {ar ? "نوع المحتوى" : "Content format"}
              <select value={type} disabled={busy} onChange={(e) => setType(e.target.value as ContentType)}>
                {(["POST", "CAROUSEL", "REEL", "STORY"] as const).map((value, i) => (
                  <option key={value} value={value}>
                    {(ar ? ["منشور", "منشور متعدد", "ريل", "قصة"] : ["Post", "Carousel", "Reel", "Story"])[i]}
                  </option>
                ))}
              </select>
            </label>
            <button className="studio-button" disabled={busy} onClick={() => void blank()}>
              {busy ? (ar ? "جارٍ الفتح…" : "Opening…") : ar ? "فتح مسودة فارغة" : "Open blank draft"}
            </button>
          </div>
        </details>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </div>
  );
}
