import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAccount, useAppearance } from "./providers";
import { Button, Card, Field, Notice, Txt } from "./ui";
import { errorMessage } from "./errors";
import { sessionController } from "./auth/transport";

export function JoinWorkspace() {
  const { api, scope, queryClient } = useAccount();
  const { t } = useAppearance();
  const [open, setOpen] = useState(false),
    [code, setCode] = useState("");
  const [accepted, setAccepted] = useState<{ workspaceId: string; name: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const join = useMutation({
    mutationFn: async () => {
      const result = await api.acceptTeamInvitation(code.trim());
      setAccepted(result);
      setCode("");
      await queryClient.invalidateQueries({ queryKey: [scope, "workspaces"] });
    }
  });
  const enter = useMutation({ mutationFn: () => sessionController.switchWorkspace({ workspaceId: accepted!.workspaceId, ...(totpCode ? { totpCode } : {}) }) });
  if (!open) return <Button secondary label={t("Join an existing workspace", "الانضمام إلى مساحة عمل موجودة")} onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Txt variant="heading">
        {accepted ? t(`Invitation accepted: ${accepted.name}`, `تم قبول الدعوة: ${accepted.name}`) : t("Join your team", "انضم إلى فريقك")}
      </Txt>
      {accepted ? (
        <>
          <Field
            label={t("Authenticator code (if enabled)", "رمز المصادقة (إذا كان مفعّلًا)")}
            value={totpCode}
            onChangeText={setTotpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Button busy={enter.isPending} label={t("Open workspace", "فتح مساحة العمل")} onPress={() => enter.mutate()} />
          {enter.isError ? <Notice error>{errorMessage(enter.error, t)}</Notice> : null}
        </>
      ) : (
        <>
          <Txt muted>
            {t(
              "Paste the invitation code from your workspace owner. Sign in with the email they invited.",
              "الصق رمز الدعوة من مالك مساحة العمل. سجّل الدخول بالبريد الذي تمت دعوته."
            )}
          </Txt>
          <Field
            label={t("Invitation code", "رمز الدعوة")}
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={64}
            editable={!join.isPending}
          />
          <Button
            busy={join.isPending}
            disabled={!/^[a-f0-9]{64}$/.test(code.trim())}
            label={t("Accept invitation", "قبول الدعوة")}
            onPress={() => join.mutate()}
          />
          {join.isError ? <Notice error>{errorMessage(join.error, t)}</Notice> : null}
        </>
      )}
      <Button secondary label={t("Close", "إغلاق")} disabled={join.isPending || enter.isPending} onPress={() => setOpen(false)} />
    </Card>
  );
}
