"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { History, Plus, X } from "lucide-react";
import type { Locale, WorkspaceChatRecord, WorkspaceChatSelection } from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import { useModalDialog } from "./use-modal-dialog";
import { TaskFeedback } from "./task-feedback";

export function WorkspaceChats({ locale, children }: { locale: Locale; children: (chat: WorkspaceChatSelection, onSent: (id: string) => void) => ReactNode }) {
  const api = useMarkosClient(locale),
    session = useMarkosSession(),
    ar = locale === "ar";
  const navKey = `markos.chat-navigation:${session?.user.id}:${session?.workspace.id}`;
  const [selected, setSelected] = useState<WorkspaceChatSelection>(),
    [chats, setChats] = useState<WorkspaceChatRecord[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    async (cursor?: string) => {
      const page = await api.assistantChats(cursor);
      setChats((old) => (cursor ? [...old, ...page.items.filter((row) => !old.some((item) => item.id === row.id))] : page.items));
      setCursor(page.nextCursor);
      return page.items;
    },
    [api]
  );
  useEffect(() => {
    let live = true;
    void load()
      .then((rows) => {
        if (!live) return;
        let saved: WorkspaceChatSelection | null = null;
        try {
          saved = JSON.parse(localStorage.getItem(navKey) ?? "null");
        } catch {}
        const first = rows[0];
        setSelected((current) => {
          const choice =
            current ??
            (saved && typeof saved.id === "string"
              ? saved
              : first
                ? { id: first.id, isNew: false, legacy: first.legacy, title: first.title }
                : { id: crypto.randomUUID(), isNew: true });
          try {
            localStorage.setItem(navKey, JSON.stringify(choice));
          } catch {}
          return choice;
        });
      })
      .catch(() => {
        if (live) setError(ar ? "تعذّر تحميل المحادثات. أعد تحميل الصفحة." : "Couldn’t load your chats. Refresh to retry.");
      });
    return () => {
      live = false;
    };
  }, [load, navKey, ar]);
  function choose(value: WorkspaceChatSelection) {
    try {
      localStorage.setItem(navKey, JSON.stringify(value));
    } catch {}
    setSelected(value);
    setOpen(false);
  }
  function sent(id: string) {
    setSelected((current) => {
      if (current?.id !== id) return current;
      const next = { ...current, isNew: false };
      try {
        localStorage.setItem(navKey, JSON.stringify(next));
      } catch {}
      return next;
    });
    void load().catch(() => {});
  }
  const current = chats.find((chat) => chat.id === selected?.id),
    title =
      current?.legacy && current.title === "Earlier conversation"
        ? ar
          ? "المحادثة السابقة"
          : "Earlier conversation"
        : (current?.title ?? selected?.title ?? (ar ? "محادثة جديدة" : "New chat"));
  return (
    <div className="workspace-chat-home">
      <header className="workspace-chat-toolbar">
        <button
          className="workspace-chat-toolbar-button"
          onClick={() => {
            setOpen(true);
            void load().catch(() => setError(ar ? "تعذّر تحديث المحادثات." : "Couldn’t refresh your chats."));
          }}
        >
          <History size={19} />
          <span>{ar ? "المحادثات" : "Chats"}</span>
        </button>
        <span className="workspace-chat-current" dir="auto">
          {selected?.isNew ? null : title}
        </span>
        {session?.roles.some((role) => ["OWNER", "WORKSPACE_ADMIN", "EDITOR", "SUPER_ADMIN", "PRODUCT_ADMIN"].includes(role)) ? (
          <button className="workspace-chat-toolbar-button" onClick={() => choose({ id: crypto.randomUUID(), isNew: true })}>
            <Plus size={19} />
            <span>{ar ? "محادثة جديدة" : "New chat"}</span>
          </button>
        ) : null}
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {selected ? children(selected, sent) : !error ? <TaskFeedback locale={locale} label={ar ? "جارٍ فتح محادثاتك" : "Opening your chats"} /> : null}
      {open ? (
        <ChatHistory
          locale={locale}
          chats={chats}
          selected={selected}
          title={title}
          more={!!cursor}
          onClose={() => setOpen(false)}
          onChoose={(chat) => choose({ id: chat.id, isNew: false, legacy: chat.legacy, title: chat.title })}
          onMore={() => load(cursor ?? undefined)}
          onRename={async (title) => {
            if (!selected || selected.isNew) return;
            const row = await api.renameAssistantChat(selected.id, title);
            setChats((items) => items.map((chat) => (chat.id === row.id ? row : chat)));
            choose({ ...selected, title: row.title });
          }}
        />
      ) : null}
    </div>
  );
}
function ChatHistory({
  locale,
  chats,
  selected,
  title,
  more,
  onClose,
  onChoose,
  onMore,
  onRename
}: {
  locale: Locale;
  chats: WorkspaceChatRecord[];
  selected: WorkspaceChatSelection | undefined;
  title: string;
  more: boolean;
  onClose: () => void;
  onChoose: (chat: WorkspaceChatRecord) => void;
  onMore: () => Promise<unknown>;
  onRename: (title: string) => Promise<void>;
}) {
  const ar = locale === "ar",
    { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose });
  const [query, setQuery] = useState(""),
    [rename, setRename] = useState(false),
    [name, setName] = useState(title),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <dialog className="workspace-chat-history" aria-label={ar ? "المحادثات" : "Chats"} ref={dialogRef} onCancel={onCancel} onKeyDown={onKeyDown}>
      <header>
        <h2>{ar ? "محادثاتك" : "Your chats"}</h2>
        <button aria-label={ar ? "إغلاق" : "Close"} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <input
        className="sunlit-field"
        aria-label={ar ? "البحث في المحادثات" : "Search chats"}
        placeholder={ar ? "البحث في المحادثات" : "Search chats"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {selected && !selected.isNew ? (
        <button className="workspace-chat-link" onClick={() => setRename(!rename)}>
          {ar ? "إعادة تسمية المحادثة الحالية" : "Rename current chat"}
        </button>
      ) : null}
      {rename ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || busy) return;
            setBusy(true);
            void onRename(name.trim()).catch(() => {
              setError(ar ? "تعذّر حفظ الاسم." : "Couldn’t save the name.");
              setBusy(false);
            });
          }}
        >
          <label>
            {ar ? "اسم المحادثة" : "Chat name"}
            <input className="sunlit-field" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="sunlit-primary" disabled={busy || !name.trim()}>
            {ar ? "حفظ الاسم" : "Save name"}
          </button>
        </form>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="workspace-chat-history-list">
        {chats
          .filter((chat) => chat.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
          .map((chat) => (
            <button key={chat.id} aria-current={chat.id === selected?.id ? "true" : undefined} onClick={() => onChoose(chat)}>
              <span dir="auto">{chat.legacy && chat.title === "Earlier conversation" ? (ar ? "المحادثة السابقة" : "Earlier conversation") : chat.title}</span>
              <small>{new Date(chat.updatedAt).toLocaleDateString(locale, { dateStyle: "medium" })}</small>
            </button>
          ))}
      </div>
      {!chats.length ? <p>{ar ? "ستظهر محادثاتك هنا بعد إرسال أول رسالة." : "Your chats appear here after your first message."}</p> : null}
      {more ? (
        <button
          className="workspace-chat-link"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onMore()
              .catch(() => setError(ar ? "تعذّر تحميل المزيد." : "Couldn’t load more chats."))
              .finally(() => setBusy(false));
          }}
        >
          {ar ? "تحميل المزيد" : "Load more"}
        </button>
      ) : null}
    </dialog>
  );
}
