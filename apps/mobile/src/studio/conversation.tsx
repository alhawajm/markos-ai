import React, { useEffect, useMemo, useRef, useState } from "react";
import { MarkosApiError } from "@markos/api-client";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useIsFocused } from "expo-router/react-navigation";
import { Send, Sparkles } from "lucide-react-native";
import type { ContentConversationRecord, ContentRecord, ConversationTurnInput } from "@markos/shared-types";
import { useAccount, useAppearance } from "../providers";
import { Button, Card, Field, Loading, Notice, Row, Txt } from "../ui";
import { errorMessage } from "../errors";
import { newRequestId } from "../request-id";
import { conversationActive } from "./model";
import { sessionController } from "../auth/transport";
import { StudioDeviceStore } from "./device-store";

export function StudioConversation({
  item,
  busy,
  save,
  accept,
  run,
  disabled,
  visible,
  openMedia,
  openPreview
}: {
  item: ContentRecord;
  busy: boolean;
  disabled: boolean;
  visible: boolean;
  save: () => Promise<ContentRecord>;
  accept: (item: ContentRecord) => void;
  run: (work: () => Promise<void>) => Promise<void>;
  openMedia: () => void;
  openPreview: () => void;
}) {
  const { api, scope, epoch, queryClient } = useAccount();
  const focused = useIsFocused();
  const { t, locale, colors } = useAppearance();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<ConversationTurnInput | null>(null);
  const pendingRef = useRef(pending);
  const [error, setError] = useState("");
  const [rejected, setRejected] = useState(false);
  const [restored, setRestored] = useState(false);
  const device = useMemo(() => new StudioDeviceStore(scope, epoch, item.id, item.workspaceId), [scope, epoch, item.id, item.workspaceId]);
  const [deviceStatus, setDeviceStatus] = useState<"saving" | "saved" | "error">("saved");
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const messageWrite = useRef(0);
  const queryKey = [scope, "conversation", item.id];
  const result = useQuery({ queryKey, queryFn: () => api.contentConversation(item.id), refetchInterval: 2500, enabled: focused });
  const latest = result.data?.latestRun;
  const video = useQuery({ queryKey: [scope, "video-job", item.id], queryFn: () => api.latestMediaGenerationJob(item.id), enabled: focused });
  const active = conversationActive(latest?.status);
  useEffect(() => {
    if (result.data) accept(result.data.contentItem);
  }, [result.data, busy, accept]);
  useEffect(() => {
    if (latest && !conversationActive(latest.status)) {
      void queryClient.invalidateQueries({ queryKey: [scope, "media"] });
      void queryClient.invalidateQueries({ queryKey: [scope, "content", item.id] });
    }
  }, [latest?.id, latest?.status]);
  useEffect(() => {
    let mounted = true;
    setRestoreError(false);
    void device
      .readMessage()
      .then((saved) => {
        sessionController.assertEpoch(epoch);
        if (!mounted) return;
        pendingRef.current = saved.pending;
        setPending(saved.pending);
        setMessage(saved.text);
        setRestored(true);
      })
      .catch(() => {
        if (mounted) setRestoreError(true);
      });
    return () => {
      mounted = false;
    };
  }, [device, epoch, restoreAttempt]);
  function editMessage(text: string) {
    setMessage(text);
    const write = ++messageWrite.current;
    setDeviceStatus("saving");
    void device
      .saveMessage(text)
      .then(() => {
        if (write === messageWrite.current) setDeviceStatus("saved");
      })
      .catch(() => {
        if (write === messageWrite.current) setDeviceStatus("error");
      });
  }
  async function received(value: ContentConversationRecord, requestId: string) {
    sessionController.assertEpoch(epoch);
    const finished = await device.finishMessage(requestId);
    sessionController.assertEpoch(epoch);
    if (finished && pendingRef.current?.requestId === requestId) {
      pendingRef.current = null;
      setPending(null);
    }
    queryClient.setQueryData(queryKey, value);
    accept(value.contentItem);
  }
  useEffect(() => {
    if (pending && latest?.requestId === pending.requestId && result.data) void received(result.data, pending.requestId).catch(() => {});
  }, [pending?.requestId, latest?.requestId]);
  async function send(suggestion?: string) {
    setError("");
    setRejected(false);
    await run(async () => {
      try {
        let intent = pendingRef.current;
        if (!intent) {
          const saved = await save();
          intent = { requestId: newRequestId(), expectedRevision: saved.revision, message: (suggestion ?? message).trim(), locale };
          await device.startMessage(intent);
          sessionController.assertEpoch(epoch);
          setMessage("");
          pendingRef.current = intent;
          setPending(intent);
        }
        await received(await api.sendConversationMessage(item.id, intent), intent.requestId);
      } catch (problem) {
        setError(errorMessage(problem, t));
        setRejected(
          problem instanceof MarkosApiError &&
            ["VALIDATION_ERROR", "CONTENT_REVISION_CONFLICT", "CONTENT_LOCKED", "CONVERSATION_BUSY", "FORBIDDEN"].includes(problem.code ?? "")
        );
      }
    });
  }
  if (!visible) return null;
  return (
    <View style={{ gap: 16 }}>
      <Row>
        <Sparkles size={24} strokeWidth={1.5} color={colors.accent} />
        <Txt variant="heading">MARKOS</Txt>
      </Row>
      {!result.data?.messages.length && !result.isPending ? (
        <Card tone="tint">
          <Txt>
            {t(
              "Tell MARKOS what to create or change. Your business profile and campaign references are already part of the conversation.",
              "أخبر ماركوس بما تريد إنشاءه أو تغييره. ملف نشاطك ومراجع حملتك جزء من سياق المحادثة."
            )}
          </Txt>
          <Button
            secondary
            disabled={busy || disabled || active || !restored || !!pending || !!message.trim()}
            label={t("Prepare this draft", "إعداد هذه المسودة")}
            onPress={() =>
              void send(
                t(
                  `Prepare the caption and visual directions for this ${item.contentType.toLowerCase()} using its brief and campaign context. Keep the selected format. Save the draft for my review; do not mark it ready or schedule it.`,
                  `أعدّ النص والتوجيهات البصرية لهذه المسودة باستخدام ملخصها وسياق الحملة. حافظ على نوع المحتوى المحدد واحفظها لمراجعتي دون اعتماد أو جدولة.`
                )
              )
            }
          />
        </Card>
      ) : null}
      {result.isPending ? <Loading /> : null}
      {result.data?.messages.map((entry) => (
        <View
          key={entry.id}
          style={{
            alignSelf: entry.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "95%",
            padding: 16,
            gap: 8,
            borderRadius: 16,
            backgroundColor: entry.role === "user" ? colors.secondarySoft : colors.surfaceMuted
          }}
        >
          <Txt variant="meta" muted>
            {entry.role === "user" ? t("You", "أنت") : "MARKOS"}
          </Txt>
          <Txt selectable>{entry.text}</Txt>
        </View>
      ))}
      {active ? (
        <Notice>{t("MARKOS is working. You can leave and return to this conversation.", "ماركوس يعمل الآن. يمكنك المغادرة والعودة إلى هذه المحادثة.")}</Notice>
      ) : null}
      {latest && ["FAILED", "CONFLICT"].includes(latest.status) ? (
        <Card tone="warning">
          <Txt>
            {latest.status === "CONFLICT"
              ? t(
                  "The draft changed before the Assistant could apply its response. Your current edits are preserved.",
                  "تغيّرت المسودة قبل تطبيق رد المساعد. تعديلاتك الحالية محفوظة."
                )
              : t(
                  "The Assistant could not finish this request. Your draft is preserved. Review it before trying again.",
                  "تعذّر على المساعد إكمال الطلب. مسودتك محفوظة. راجعها قبل المحاولة مجددًا."
                )}
          </Txt>
          {latest.proposedCaption ? <Txt selectable>{latest.proposedCaption}</Txt> : null}
          <Button
            secondary
            disabled={busy || disabled || !!pending || !!message.trim()}
            label={t("Edit the last request", "تعديل الطلب السابق")}
            onPress={() => editMessage([...result.data!.messages].reverse().find((entry) => entry.role === "user")?.text ?? "")}
          />
        </Card>
      ) : null}
      {latest?.status === "AWAITING_CONFIRMATION" && latest.confirmation ? (
        <Card tone="warning">
          <Txt variant="heading">{t("Review the proposed changes", "راجع التغييرات المقترحة")}</Txt>
          {latest.confirmation.consequences.map((text, index) => (
            <Txt key={index}>{text}</Txt>
          ))}
          <Button
            disabled={busy || disabled}
            label={t("Apply these changes", "تطبيق هذه التغييرات")}
            onPress={() => {
              void run(async () => {
                const confirmation = latest.confirmation!;
                const value = await api.confirmConversationActions(item.id, latest.id, {
                  confirmationToken: confirmation.token,
                  expectedRevision: confirmation.revision
                });
                queryClient.setQueryData(queryKey, value);
                accept(value.contentItem);
              });
            }}
          />
        </Card>
      ) : null}
      {latest?.actions?.generation.map((recorded) => {
        const job = video.data?.id === recorded.jobId ? video.data : null;
        const action = {
          ...recorded,
          status:
            job?.status === "FAILED" || job?.status === "CANCELLED"
              ? "FAILED"
              : job?.status === "COMPLETED"
                ? item.mediaItems.some((media) => media.mediaAssetId === job.outputMediaAssetId)
                  ? "ATTACHED"
                  : "LIBRARY_ONLY"
                : recorded.status
        };
        return (
          <Notice key={action.itemId} error={["FAILED", "UNKNOWN"].includes(action.status)}>
            {action.status === "ATTACHED"
              ? t("Generated media attached to the draft.", "تم إرفاق الوسائط المنشأة بالمسودة.")
              : action.status === "LIBRARY_ONLY"
                ? t("Media saved to your library. Choose it in Media to attach it.", "حُفظت الوسائط في المكتبة. اخترها من قسم الوسائط لإرفاقها.")
                : ["FAILED", "UNKNOWN"].includes(action.status)
                  ? t(
                      "Media generation needs attention. Open Media to check and retry.",
                      "يتطلب إنشاء الوسائط انتباهك. افتح قسم الوسائط للتحقّق وإعادة المحاولة."
                    )
                  : t("Media generation is in progress.", "جارٍ إنشاء الوسائط.")}
          </Notice>
        );
      })}
      {latest && !active ? (
        <Card tone="tint">
          <Txt>
            {t(
              "Review the draft and its media. A written draft does not contain a generated image or video until media is attached.",
              "راجع المسودة ووسائطها. المسودة المكتوبة لا تحتوي على صورة أو فيديو منشأ حتى تُرفق الوسائط."
            )}
          </Txt>
          <Button secondary label={t("Review full draft", "مراجعة المسودة كاملة")} onPress={openPreview} />
          <Button label={t("Generate or choose media", "إنشاء أو اختيار الوسائط")} onPress={openMedia} />
        </Card>
      ) : null}
      {error || result.isError ? <Notice error>{error || errorMessage(result.error, t)}</Notice> : null}
      {restoreError ? (
        <>
          <Notice error>
            {t("Couldn’t restore your saved message. Retry before writing a new one.", "تعذّرت استعادة رسالتك المحفوظة. أعد المحاولة قبل كتابة رسالة جديدة.")}
          </Notice>
          <Button label={t("Retry recovery", "إعادة محاولة الاستعادة")} onPress={() => setRestoreAttempt((value) => value + 1)} />
        </>
      ) : null}
      {pending ? (
        <Card tone="warning">
          <Txt>
            {t(
              "This message is saved on your device. Check its response without sending a second request.",
              "هذه الرسالة محفوظة على جهازك. تحقّق من الرد دون إرسال طلب ثانٍ."
            )}
          </Txt>
          <Txt>{pending.message}</Txt>
          <Button
            label={t("Recover message", "استعادة الرسالة")}
            disabled={busy || !restored}
            onPress={() => {
              void send();
            }}
          />
          {rejected ? (
            <Button
              secondary
              label={t("Edit message and try again", "تعديل الرسالة والمحاولة مجددًا")}
              disabled={busy}
              onPress={() => {
                void run(async () => {
                  const text = await device.editRejectedMessage(pending.requestId);
                  sessionController.assertEpoch(epoch);
                  if (text === null || pendingRef.current?.requestId !== pending.requestId) return;
                  setMessage(text);
                  setPending(null);
                  pendingRef.current = null;
                  setRejected(false);
                  setError("");
                });
              }}
            />
          ) : null}
        </Card>
      ) : (
        <>
          <Field
            label={t("Message MARKOS", "راسل ماركوس")}
            value={message}
            onChangeText={editMessage}
            multiline
            maxLength={4000}
            editable={restored && !busy && !disabled && !active}
            style={{ minHeight: 100 }}
            placeholder={
              item.contentType === "REEL"
                ? t("Write the caption and plan my Reel…", "اكتب النص وخطّط الريل…")
                : item.contentType === "CAROUSEL"
                  ? t("Prepare the caption and each slide…", "أعدّ النص وكل شريحة…")
                  : item.contentType === "STORY"
                    ? t("Prepare my image or video Story…", "أعدّ قصتي كصورة أو فيديو…")
                    : t("Write the caption and image direction…", "اكتب النص والتوجّه البصري للصورة…")
            }
          />
          {message ? (
            <Txt variant="meta" muted>
              {deviceStatus === "saved"
                ? t("Unsent message saved on this device", "الرسالة غير المرسلة محفوظة على هذا الجهاز")
                : deviceStatus === "saving"
                  ? t("Saving message…", "جارٍ حفظ الرسالة…")
                  : t("Couldn’t save this message on the device. Keep the app open.", "تعذّر حفظ الرسالة على الجهاز. أبقِ التطبيق مفتوحًا.")}
            </Txt>
          ) : null}
          <Button
            icon={Send}
            label={t("Send", "إرسال")}
            disabled={busy || disabled || active || !restored || !message.trim()}
            onPress={() => {
              void send();
            }}
          />
        </>
      )}
    </View>
  );
}
