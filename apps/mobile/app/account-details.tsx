import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AccountSettings } from "@markos/api-client";
import { useAccount, useAppearance } from "../src/providers";
import { sessionController } from "../src/auth/transport";
import { errorMessage } from "../src/errors";
import { QueryFailure } from "../src/content";
import { Button, Card, Field, Loading, Notice, Screen, Txt } from "../src/ui";

export default function AccountDetails() {
  const { api, scope } = useAccount();
  const query = useQuery({ queryKey: [scope, "account-settings"], queryFn: () => api.accountSettings() });
  return (
    <Screen>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <QueryFailure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <Details key={`${scope}:${query.data.user.updatedAt}:${query.data.workspace.updatedAt}`} data={query.data} />
      )}
    </Screen>
  );
}
function Details({ data }: { data: AccountSettings }) {
  const { api, scope, epoch, queryClient } = useAccount();
  const { t, setPreferences } = useAppearance();
  const [name, setName] = useState(data.user.fullName);
  const [locale, setLocale] = useState(data.user.locale);
  const [workspace, setWorkspace] = useState(data.workspace.name);
  const saved = useMutation({
    mutationFn: async (kind: "account" | "workspace") => {
      if (kind === "account") await api.updateAccount({ fullName: name.trim(), locale, expectedUpdatedAt: data.user.updatedAt });
      else await api.updateWorkspaceSettings({ name: workspace.trim(), expectedUpdatedAt: data.workspace.updatedAt });
      sessionController.assertEpoch(epoch);
      if (kind === "account") await setPreferences({ locale });
      await sessionController.renew();
      await queryClient.invalidateQueries({ queryKey: [scope, "account-settings"] });
    }
  });
  return (
    <>
      <Txt variant="title">{t("Your details", "بياناتك")}</Txt>
      <Card>
        <Field label={t("Full name", "الاسم الكامل")} value={name} onChangeText={setName} maxLength={120} editable={!saved.isPending} />
        <Txt muted>{data.user.email}</Txt>
        <Txt variant="label">{t("Account language", "لغة الحساب")}</Txt>
        <Button secondary={locale !== "en"} label="English" onPress={() => setLocale("en")} disabled={saved.isPending} />
        <Button secondary={locale !== "ar"} label="العربية" onPress={() => setLocale("ar")} disabled={saved.isPending} />
        <Button
          label={t("Save details", "حفظ البيانات")}
          busy={saved.isPending}
          disabled={name.trim().length < 2 || (name.trim() === data.user.fullName && locale === data.user.locale)}
          onPress={() => saved.mutate("account")}
        />
      </Card>
      {data.workspace.ownerUserId === data.user.id ? (
        <Card>
          <Txt variant="heading">{t("Workspace", "مساحة العمل")}</Txt>
          <Field label={t("Workspace name", "اسم مساحة العمل")} value={workspace} onChangeText={setWorkspace} maxLength={120} editable={!saved.isPending} />
          <Button
            secondary
            label={t("Save workspace name", "حفظ اسم مساحة العمل")}
            busy={saved.isPending}
            disabled={workspace.trim().length < 2 || workspace.trim() === data.workspace.name}
            onPress={() => saved.mutate("workspace")}
          />
        </Card>
      ) : null}
      {saved.isError ? (
        <>
          <Notice error>{errorMessage(saved.error, t)}</Notice>
          <Button
            secondary
            label={t("Reload saved details", "إعادة تحميل البيانات المحفوظة")}
            onPress={() => void queryClient.invalidateQueries({ queryKey: [scope, "account-settings"] })}
          />
        </>
      ) : null}
    </>
  );
}
