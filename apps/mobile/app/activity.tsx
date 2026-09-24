import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useAppearance } from "../src/providers";
import { Card, Loading, Screen, Txt } from "../src/ui";
import { QueryFailure } from "../src/content";

export default function Activity() {
  const { api, scope } = useAccount();
  const { t, locale } = useAppearance();
  const query = useQuery({ queryKey: [scope, "workspace-activity"], queryFn: () => api.auditLogs({ limit: 100 }) });
  return (
    <Screen>
      <Txt variant="title">{t("Workspace activity", "نشاط مساحة العمل")}</Txt>
      <Txt muted>{t("The latest 100 recorded actions in this workspace.", "آخر ١٠٠ إجراء مسجّل في مساحة العمل هذه.")}</Txt>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <QueryFailure error={query.error} retry={() => void query.refetch()} />
      ) : query.data.length ? (
        query.data.map((row) => (
          <Card key={row.id}>
            <Txt variant="label">{row.action.toLowerCase().replace(/_/g, " ")}</Txt>
            <Txt muted variant="meta">
              {new Date(row.createdAt).toLocaleString(locale)}
            </Txt>
          </Card>
        ))
      ) : (
        <Card>
          <Txt>{t("No recorded activity yet.", "لا يوجد نشاط مسجّل بعد.")}</Txt>
        </Card>
      )}
    </Screen>
  );
}
