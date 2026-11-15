"use client";
import { useCallback, useEffect, useState } from "react";
import type { ContentRecord, ContentType, Locale } from "@markos/shared-types";
import { useMarkosClient } from "./browser-session";
import { ContentStatusBadge } from "./content-status-badge";
import { useModalDialog } from "./use-modal-dialog";
import "./task-library.css";

export function ContentStart({ locale, onOpen }: { locale: Locale; onOpen: (id: string) => void }) {
  const api = useMarkosClient(locale),
    ar = locale === "ar";
  const [items, setItems] = useState<ContentRecord[] | null>(null),
    [error, setError] = useState(""),
    [newContent, setNewContent] = useState(false);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("drafts");
  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await api.contentItems());
    } catch {
      setError(ar ? "تعذّر تحميل المحتوى. حاول مجددًا." : "Couldn’t load your content. Try again.");
    }
  }, [api, ar]);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      api
        .contentItems()
        .then((rows) => {
          if (live) {
            setItems(rows);
            setError("");
          }
        })
        .catch(() => {
          if (live) setError(ar ? "تعذّر تحميل المحتوى. حاول مجددًا." : "Couldn’t load your content. Try again.");
        });
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 6000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api, ar]);
  const shown =
    items?.filter(
      (item) =>
        (filter === "all" || (filter === "drafts" ? ["DRAFT", "IN_REVIEW", "IDEA", "FAILED"].includes(item.status) : item.status === filter)) &&
        `${item.brief ?? ""} ${item.caption}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    ) ?? [];
  return (
    <section className="task-workspace" aria-labelledby="content-library-title">
      <header className="task-workspace-header">
        <h1 id="content-library-title">{ar ? "إنشاء" : "Create"}</h1>
        <button className="sunlit-primary" onClick={() => setNewContent(true)}>
          {ar ? "محتوى جديد" : "New content"}
        </button>
      </header>
      {items?.length ? (
        <div className="task-workspace-tools">
          <input
            className="sunlit-field"
            aria-label={ar ? "البحث في المحتوى" : "Search content"}
            placeholder={ar ? "البحث في المحتوى" : "Search content"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="sunlit-field" aria-label={ar ? "عرض المحتوى" : "Show content"} value={filter} onChange={(e) => setFilter(e.target.value)}>
            {[
              ["drafts", "Drafts", "المسودات"],
              ["APPROVED", "Ready", "جاهز"],
              ["SCHEDULED", "Scheduled", "مجدول"],
              ["PUBLISHED", "Published", "منشور"],
              ["all", "All content", "كل المحتوى"]
            ].map(([value, en, arabic]) => (
              <option key={value} value={value}>
                {ar ? arabic : en}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="sunlit-secondary" onClick={() => void load()}>
            {ar ? "إعادة المحاولة" : "Try again"}
          </button>
        </div>
      ) : null}
      {items === null && !error ? <p role="status">{ar ? "جارٍ تحميل المحتوى…" : "Loading your content…"}</p> : null}
      {items && shown.length === 0 ? (
        <div className="task-workspace-empty">
          <h2>{items.length ? (ar ? "لا يوجد محتوى مطابق" : "No matching content") : ar ? "مساحة لإبداعاتك القادمة" : "Room for your next idea"}</h2>
          <p>
            {items.length
              ? ar
                ? "جرّب بحثًا أو مرشحًا آخر."
                : "Try another search or filter."
              : ar
                ? "أنشئ مسودة، أو اطلب من ماركوس إعداد المحتوى في الرئيسية. ستجد كل أعمالك هنا."
                : "Start a draft, or ask MARKOS to create from Home. Your work will be here when you need it."}
          </p>
        </div>
      ) : null}
      <div className="task-content-grid">
        {shown.map((item) => (
          <button className="task-content-card" key={item.id} onClick={() => onOpen(item.id)}>
            <ContentStatusBadge status={item.status} locale={locale} />
            <h2 dir="auto">{item.brief?.split("\n")[0] || item.caption || (ar ? "مسودة بلا عنوان" : "Untitled draft")}</h2>
            <p dir="auto">{item.caption || (ar ? "مسودة جاهزة لمتابعة العمل" : "A draft ready to continue")}</p>
            <span className="task-content-format">
              {
                (ar
                  ? { POST: "منشور", CAROUSEL: "منشور متعدد", REEL: "ريل", STORY: "قصة" }
                  : { POST: "Post", CAROUSEL: "Carousel", REEL: "Reel", STORY: "Story" })[item.contentType]
              }
            </span>
          </button>
        ))}
      </div>
      {newContent ? <NewContent locale={locale} onClose={() => setNewContent(false)} onOpen={onOpen} /> : null}
    </section>
  );
}
function NewContent({ locale, onClose, onOpen }: { locale: Locale; onClose: () => void; onOpen: (id: string) => void }) {
  const api = useMarkosClient(locale),
    ar = locale === "ar";
  const [type, setType] = useState<ContentType>("POST"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose, closeDisabled: busy });
  async function open() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onOpen((await api.createContent({ contentType: type })).id);
    } catch {
      setBusy(false);
      setError(ar ? "تعذّر فتح المسودة. حاول مجددًا." : "Couldn’t open the draft. Try again.");
    }
  }
  return (
    <dialog className="task-new-dialog" aria-label={ar ? "محتوى جديد" : "New content"} ref={dialogRef} onCancel={onCancel} onKeyDown={onKeyDown}>
      <header className="task-workspace-header">
        <h2>{ar ? "محتوى جديد" : "New content"}</h2>
        <button className="sunlit-secondary" disabled={busy} onClick={onClose}>
          {ar ? "إغلاق" : "Close"}
        </button>
      </header>
      <label>
        {ar ? "نوع المحتوى" : "Content format"}
        <select className="sunlit-field" value={type} disabled={busy} onChange={(e) => setType(e.target.value as ContentType)}>
          {(["POST", "CAROUSEL", "REEL", "STORY"] as const).map((value, i) => (
            <option key={value} value={value}>
              {(ar ? ["منشور", "منشور متعدد", "ريل", "قصة"] : ["Post", "Carousel", "Reel", "Story"])[i]}
            </option>
          ))}
        </select>
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button className="sunlit-primary" disabled={busy} onClick={() => void open()}>
        {busy ? (ar ? "جارٍ الفتح…" : "Opening…") : ar ? "فتح المسودة" : "Open draft"}
      </button>
    </dialog>
  );
}
