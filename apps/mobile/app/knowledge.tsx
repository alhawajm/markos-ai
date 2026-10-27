import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { KnowledgeVaultEntry } from "@markos/shared-types";
import { useAccount, useAppearance } from "../src/providers";
import { Button, Card, Field, Loading, Screen, Txt } from "../src/ui";
import { QueryFailure } from "../src/content";

const readable = (key: string) => key.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
export default function Knowledge() {
  const { api, scope } = useAccount();
  const { t } = useAppearance();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: [scope, "knowledge"], queryFn: () => api.vault() });
  const entries = Object.values(query.data ?? {})
    .flat()
    .filter((row) => JSON.stringify([row.key, row.value]).toLowerCase().includes(search.toLowerCase()));
  return (
    <Screen>
      <Txt variant="title">{t("What MARKOS knows", "ما يعرفه ماركوس")}</Txt>
      <Txt muted>
        {t(
          "Saved facts guide campaign planning and AI advice. Review changes here; update facts in your business profile.",
          "توجّه المعلومات المحفوظة تخطيط الحملات ونصائح الذكاء الاصطناعي. راجع التغييرات هنا وحدّث المعلومات في ملف نشاطك."
        )}
      </Txt>
      <Button secondary label={t("Edit business profile", "تعديل ملف النشاط")} onPress={() => router.push("/business")} />
      <Field label={t("Search saved knowledge", "البحث في المعلومات المحفوظة")} value={search} onChangeText={setSearch} />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <QueryFailure error={query.error} retry={() => void query.refetch()} />
      ) : entries.length ? (
        entries.map((entry) => <Entry key={`${scope}:${entry.id}:${entry.version}`} entry={entry} />)
      ) : (
        <Card>
          <Txt>{t("No saved facts match this search.", "لا توجد معلومات محفوظة تطابق هذا البحث.")}</Txt>
        </Card>
      )}
    </Screen>
  );
}
function Entry({ entry }: { entry: KnowledgeVaultEntry }) {
  const { api, scope } = useAccount();
  const { t, locale } = useAppearance();
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: [scope, "knowledge-history", entry.section, entry.key],
    queryFn: () => api.vaultEntryHistory(entry.section, entry.key),
    enabled: open
  });
  return (
    <Card>
      <Txt variant="heading">{readable(entry.key)}</Txt>
      <Facts value={entry.value} />
      <Txt variant="meta" muted>
        {t(`Version ${entry.version}`, `الإصدار ${entry.version}`)} · {new Date(entry.updatedAt).toLocaleDateString(locale)}
      </Txt>
      <Button secondary label={open ? t("Hide history", "إخفاء السجل") : t("View history", "عرض السجل")} onPress={() => setOpen(!open)} />
      {open ? (
        history.isPending ? (
          <Loading />
        ) : history.isError ? (
          <QueryFailure error={history.error} retry={() => void history.refetch()} />
        ) : history.data.length ? (
          history.data.map((row) => (
            <Card tone="tint" key={row.id}>
              <Txt variant="label">
                {t(`Version ${row.version}`, `الإصدار ${row.version}`)} · {new Date(row.createdAt).toLocaleString(locale)}
              </Txt>
              <Facts value={row.value} />
            </Card>
          ))
        ) : (
          <Txt muted>{t("No earlier versions.", "لا توجد إصدارات سابقة.")}</Txt>
        )
      ) : null}
    </Card>
  );
}
function Facts({ value, depth = 0 }: { value: unknown; depth?: number }): React.ReactNode {
  const { t } = useAppearance();
  if (value === null || value === undefined) return <Txt muted>—</Txt>;
  if (typeof value === "boolean") return <Txt>{value ? t("Yes", "نعم") : t("No", "لا")}</Txt>;
  if (typeof value !== "object") return <Txt selectable>{String(value)}</Txt>;
  if (depth > 3) return <Txt selectable>{JSON.stringify(value)}</Txt>;
  return (
    <>
      {Object.entries(value).map(([key, item]) => (
        <React.Fragment key={key}>
          {!Array.isArray(value) ? (
            <Txt variant="label" muted>
              {readable(key)}
            </Txt>
          ) : null}
          <Facts value={item} depth={depth + 1} />
        </React.Fragment>
      ))}
    </>
  );
}
