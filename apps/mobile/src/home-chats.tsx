import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MessagesSquare, SquarePen } from "lucide-react-native";
import type { WorkspaceChatSelection } from "@markos/shared-types";
import { useAccount, useAppearance } from "./providers";
import { BusinessDeviceStore } from "./business/device-store";
import { newRequestId } from "./request-id";
import { Button, Field, IconButton, ListRow, Loading, Notice, Row, Sheet, TextAction, Txt } from "./ui";
import { PersonalMemorySheet } from "./personal-memory";

export function HomeChats({ children }: { children: (chat: WorkspaceChatSelection, onSent: (id: string) => void) => ReactNode }) {
  const { scope, epoch, api, queryClient, session } = useAccount(),
    { t, locale } = useAppearance();
  const nav = useMemo(() => new BusinessDeviceStore<WorkspaceChatSelection>(scope, epoch, "assistant-navigation"), [scope, epoch]);
  const [selected, setSelected] = useState<WorkspaceChatSelection>(),
    [restored, setRestored] = useState(false),
    [open, setOpen] = useState(false),
    [memory, setMemory] = useState(false),
    [query, setQuery] = useState(""),
    [rename, setRename] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const result = useInfiniteQuery({
    queryKey: [scope, "assistant-chats"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.assistantChats(pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined
  });
  const chats = result.data?.pages.flatMap((page) => page.items) ?? [];
  useEffect(() => {
    let live = true;
    void nav
      .read()
      .then((value) => {
        if (live) {
          if (value) setSelected(value);
          setRestored(true);
        }
      })
      .catch(() => {
        if (live) setError(t("Couldn’t restore your chats. Reopen Home to retry.", "تعذّر استعادة محادثاتك. أعد فتح الرئيسية للمحاولة."));
      });
    return () => {
      live = false;
    };
  }, [nav]);
  useEffect(() => {
    if (restored && !selected && result.isSuccess) {
      const first = chats[0];
      choose(first ? { id: first.id, isNew: false, title: first.title, legacy: first.legacy } : { id: newRequestId(), isNew: true });
    }
  }, [restored, result.isSuccess, selected, chats[0]?.id]);
  function choose(chat: WorkspaceChatSelection) {
    setSelected(chat);
    setOpen(false);
    setRename(false);
    void nav.save(chat).catch(() => setError(t("Couldn’t save the selected chat on this device.", "تعذّر حفظ المحادثة المحددة على هذا الجهاز.")));
  }
  function sent(id: string) {
    setSelected((current) => {
      if (current?.id !== id) return current;
      const next = { ...current, isNew: false };
      void nav.save(next).catch(() => {});
      return next;
    });
    void queryClient.invalidateQueries({ queryKey: [scope, "assistant-chats"] });
  }
  const row = chats.find((chat) => chat.id === selected?.id),
    title =
      row?.legacy && row.title === "Earlier conversation"
        ? t("Earlier conversation", "المحادثة السابقة")
        : (row?.title ?? selected?.title ?? t("New chat", "محادثة جديدة"));
  const canWrite = session.roles.some((role) => ["OWNER", "WORKSPACE_ADMIN", "EDITOR", "SUPER_ADMIN", "PRODUCT_ADMIN"].includes(role));
  return (
    <View style={{ flex: 1 }}>
      <Row style={{ paddingHorizontal: 12, gap: 8 }}>
        <IconButton
          icon={MessagesSquare}
          label={t("Chats", "المحادثات")}
          onPress={() => {
            setOpen(true);
            void result.refetch();
          }}
        />
        <Txt variant="label" numberOfLines={1} style={{ flex: 1, fontSize: 16 }}>
          {selected?.isNew ? t("New chat", "محادثة جديدة") : title}
        </Txt>
        {canWrite ? <IconButton icon={SquarePen} label={t("New chat", "محادثة جديدة")} onPress={() => choose({ id: newRequestId(), isNew: true })} /> : null}
      </Row>
      {error ? <Notice error>{error}</Notice> : null}
      {selected ? (
        children(selected, sent)
      ) : result.isError ? (
        <Notice error>{t("Couldn’t load your chats. Open Chats to retry.", "تعذّر تحميل المحادثات. افتح المحادثات للمحاولة مجددًا.")}</Notice>
      ) : (
        <Loading />
      )}
      <Sheet visible={open} title={t("Your chats", "محادثاتك")} onClose={() => setOpen(false)}>
        <Field label={t("Search chats", "البحث في المحادثات")} value={query} onChangeText={setQuery} />
        {selected && !selected.isNew ? (
          <TextAction
            label={t("Rename current chat", "إعادة تسمية المحادثة الحالية")}
            onPress={() => {
              setRename(!rename);
              setName(title);
            }}
          />
        ) : null}
        {rename ? (
          <>
            <Field label={t("Chat name", "اسم المحادثة")} value={name} onChangeText={setName} maxLength={100} />
            <Button
              label={t("Save name", "حفظ الاسم")}
              busy={busy}
              disabled={!name.trim()}
              onPress={() => {
                if (!selected) return;
                setBusy(true);
                void api
                  .renameAssistantChat(selected.id, name.trim())
                  .then((chat) => {
                    choose({ ...selected, title: chat.title });
                    void result.refetch();
                  })
                  .catch(() => setError(t("Couldn’t save the name.", "تعذّر حفظ الاسم.")))
                  .finally(() => setBusy(false));
              }}
            />
          </>
        ) : null}
        {chats
          .filter((chat) => chat.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
          .map((chat) => (
            <ListRow
              key={chat.id}
              label={chat.legacy && chat.title === "Earlier conversation" ? t("Earlier conversation", "المحادثة السابقة") : chat.title}
              detail={new Date(chat.updatedAt).toLocaleDateString(locale, { dateStyle: "medium" })}
              selected={chat.id === selected?.id}
              onPress={() => choose({ id: chat.id, isNew: false, title: chat.title, legacy: chat.legacy })}
            />
          ))}
        {result.isPending ? <Loading /> : null}
        {result.hasNextPage ? (
          <Button secondary label={t("Load more", "تحميل المزيد")} busy={result.isFetchingNextPage} onPress={() => void result.fetchNextPage()} />
        ) : null}
        <TextAction
          label={t("What MARKOS remembers", "ما يتذكره ماركوس")}
          onPress={() => {
            setOpen(false);
            setMemory(true);
          }}
        />
      </Sheet>
      {memory ? <PersonalMemorySheet key={scope} onClose={() => setMemory(false)} /> : null}
    </View>
  );
}
