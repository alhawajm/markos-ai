import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useQuery } from "@tanstack/react-query";
import type { BusinessKnowledgeRecord, BusinessKnowledgeModule, OfferingMaintenanceUpdate } from "@markos/shared-types";
import { MarkosApiError } from "@markos/api-client";
import { Pencil, Plus } from "lucide-react-native";
import { useAccount, useAppearance } from "../src/providers";
import { Button, Card, Field, Loading, Notice, Row, Screen, Txt } from "../src/ui";
import { QueryFailure, WebButton } from "../src/content";
import { errorMessage } from "../src/errors";
import { BusinessDeviceStore } from "../src/business/device-store";
import { ModuleForm } from "../src/business/forms";
import { changesBetween, clean, display, fields, fromKnowledge, knowledgeVersion, labels, type Module, type Values } from "../src/business/model";

type Edit = { module: Module; baseVersion: number; base: Values; value: Values; offering?: boolean; offeringId?: string };
const groups: { label: [string, string]; modules: Module[] }[] = [
  { label: ["Strategy", "الاستراتيجية"], modules: ["objectives"] },
  { label: ["Products", "المنتجات"], modules: ["products"] },
  { label: ["Audience & market", "الجمهور والسوق"], modules: ["audience", "competitors"] },
  { label: ["Brand & voice", "العلامة والأسلوب"], modules: ["brand"] },
  { label: ["Business", "النشاط"], modules: ["company", "story"] }
];
export default function Business() {
  const { api, scope, epoch, queryClient } = useAccount();
  const { t } = useAppearance();
  const navigation = useNavigation();
  const store = useMemo(() => new BusinessDeviceStore<Edit>(scope, epoch, "profile"), [scope, epoch]);
  const query = useQuery({ queryKey: [scope, "business"], queryFn: () => api.businessKnowledge() });
  const [group, setGroup] = useState(0);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disk, setDisk] = useState<"saved" | "saving" | "error">("saved");
  const [conflict, setConflict] = useState<BusinessKnowledgeRecord | null>(null);
  const write = useRef(0);
  const saving = useRef(false);
  usePreventRemove(busy || (!!edit && disk !== "saved"), ({ data }) => {
    if (busy) {
      Alert.alert(t("Saving changes", "جارٍ حفظ التغييرات"), t("Please wait for this save to finish.", "يرجى انتظار اكتمال الحفظ."));
      return;
    }
    if (edit)
      void store
        .save(edit)
        .then(() => navigation.dispatch(data.action))
        .catch(() =>
          Alert.alert(
            t("Your edits are not saved", "لم تُحفظ تعديلاتك"),
            t("Keep editing to retry, or leave without saving on this device.", "تابع التعديل لإعادة المحاولة، أو غادر دون الحفظ على هذا الجهاز."),
            [
              { text: t("Keep editing", "متابعة التعديل"), style: "cancel" },
              { text: t("Leave", "مغادرة"), style: "destructive", onPress: () => navigation.dispatch(data.action) }
            ]
          )
        );
  });
  useEffect(() => {
    if (!query.data || restored) return;
    let cancelled = false;
    void store
      .read()
      .then((value) => {
        if (!cancelled) {
          if (value) {
            setEdit(value);
            if (value.baseVersion !== knowledgeVersion(query.data!, value.module)) setConflict(query.data!);
          }
          setRestored(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDisk("error");
          setRestored(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query.data, restored, store]);
  function change(value: Edit) {
    setEdit(value);
    setDisk("saving");
    const id = ++write.current;
    void store
      .save(value)
      .then(() => {
        if (write.current === id) setDisk("saved");
      })
      .catch(() => {
        if (write.current === id) setDisk("error");
      });
  }
  function latestValue(value: BusinessKnowledgeRecord, editing: Edit): Values {
    return editing.offering
      ? ((value.catalog?.offerings.find((o) => o.id === editing.offeringId) as unknown as Values) ?? {})
      : fromKnowledge(value)[editing.module];
  }
  async function save() {
    if (!edit || saving.current || conflict) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      let value: BusinessKnowledgeRecord;
      if (edit.offering) {
        const { id: _id, workspaceId: _workspace, catalogId: _catalog, version: _version, createdAt: _created, updatedAt: _updated, ...offering } = edit.value;
        value = await api.maintainOffering({
          expectedVersion: edit.baseVersion,
          ...(edit.offeringId ? { id: edit.offeringId } : {}),
          offering: clean(offering) as unknown as OfferingMaintenanceUpdate["offering"]
        });
      } else if (edit.module === "products") {
        const changes = changesBetween(edit.base, edit.value);
        value = await api.updateBusinessCatalog({
          expectedVersion: edit.baseVersion,
          ...Object.fromEntries(
            Object.entries(changes)
              .filter(([k]) => k !== "items" && k !== "expectedVersion")
              .map(([k, v]) => [k, v === null ? "" : Array.isArray(v) ? clean({ value: v }).value : v])
          )
        });
      } else
        value = await api.updateBusinessKnowledge({
          expectedVersion: edit.baseVersion,
          module: edit.module as BusinessKnowledgeModule,
          changes: changesBetween(edit.base, { ...edit.value, ...Object.fromEntries(Object.entries(clean(edit.value)).filter(([, v]) => Array.isArray(v))) })
        });
      queryClient.setQueryData([scope, "business"], value);
      await store.clear();
      setEdit(null);
      setConflict(null);
      void queryClient.invalidateQueries({ queryKey: [scope, "overview"] });
    } catch (e) {
      if (e instanceof MarkosApiError && e.status === 409) {
        try {
          setConflict(await api.businessKnowledge());
        } catch {}
        setError(
          t(
            "The profile changed elsewhere. Review the latest details below; your edits are still here.",
            "تغيّر الملف في مكان آخر. راجع أحدث التفاصيل أدناه؛ تعديلاتك ما زالت محفوظة."
          )
        );
      } else setError(errorMessage(e, t));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function cancel() {
    try {
      await store.clear();
      setEdit(null);
      setConflict(null);
      setError("");
      setDisk("saved");
    } catch {
      setDisk("error");
    }
  }
  if (query.isPending || (query.data && !restored)) return <Loading />;
  if (query.isError)
    return (
      <Screen>
        <QueryFailure error={query.error} retry={() => void query.refetch()} />
      </Screen>
    );
  const value = query.data;
  if (!value) return null;
  return (
    <Screen key={edit ? `edit:${edit.module}:${edit.offeringId ?? (edit.offering ? "new" : "module")}` : `view:${group}`}>
      <Txt variant="title">{t("Your business, in focus", "نشاطك بوضوح")}</Txt>
      <Txt muted>
        {t(
          "Keep MARKOS up to date. Saved changes are shared with your website and future campaigns.",
          "أبقِ ماركوس مطّلعًا على المستجدات. تظهر التعديلات المحفوظة على الموقع وفي الحملات القادمة."
        )}
      </Txt>
      {error ? <Notice error>{error}</Notice> : null}
      {edit ? (
        <>
          <Txt variant="heading">{edit.offering ? t("Product or service", "منتج أو خدمة") : t(...labels[edit.module])}</Txt>
          {edit.offering ? (
            <>
              <Field
                label={t("Name", "الاسم")}
                value={display(edit.value.name)}
                maxLength={160}
                editable={!busy}
                onChangeText={(name) => change({ ...edit, value: { ...edit.value, name } })}
              />
              <Field
                label={t("Description", "الوصف")}
                value={display(edit.value.description)}
                maxLength={1000}
                multiline
                editable={!busy}
                onChangeText={(description) => change({ ...edit, value: { ...edit.value, description } })}
              />
              <Field
                label={t("Category", "الفئة")}
                value={display(edit.value.category)}
                maxLength={120}
                editable={!busy}
                onChangeText={(category) => change({ ...edit, value: { ...edit.value, category } })}
              />
              {(["UNSPECIFIED", "PRODUCT", "SERVICE"] as const).map((kind) => (
                <Button
                  key={kind}
                  disabled={busy}
                  secondary={edit.value.kind !== kind}
                  label={kind === "PRODUCT" ? t("Product", "منتج") : kind === "SERVICE" ? t("Service", "خدمة") : t("Not specified", "غير محدد")}
                  onPress={() => change({ ...edit, value: { ...edit.value, kind } })}
                />
              ))}
              <Txt variant="meta" muted>
                {t("Pricing and availability can be managed on the website.", "يمكن إدارة الأسعار والتوفر على الموقع.")}
              </Txt>
            </>
          ) : (
            <ModuleForm module={edit.module} value={edit.value} disabled={busy} catalogOnly onChange={(v) => change({ ...edit, value: v })} />
          )}
          {conflict ? (
            <Card tone="warning">
              <Txt variant="heading">{t("Latest saved details", "أحدث التفاصيل المحفوظة")}</Txt>
              {Object.keys(changesBetween(edit.base, edit.value)).map((key) => (
                <View key={key}>
                  <Txt variant="label">{t(...(fields[edit.module].find((f) => f.key === key)?.label ?? [key, key]))}</Txt>
                  <Txt>{display(latestValue(conflict, edit)[key]) || t("No text saved", "لا يوجد نص محفوظ")}</Txt>
                </View>
              ))}
              <Button
                disabled={busy}
                secondary
                label={t("Keep my edits on this version", "إبقاء تعديلاتي على هذه النسخة")}
                onPress={() => {
                  const latest = latestValue(conflict, edit);
                  change({
                    ...edit,
                    baseVersion: knowledgeVersion(conflict, edit.module),
                    base: latest,
                    value: { ...latest, ...changesBetween(edit.base, edit.value) }
                  });
                  setConflict(null);
                  setError("");
                }}
              />
            </Card>
          ) : null}
          <Button
            busy={busy}
            disabled={!!conflict || Object.keys(changesBetween(edit.base, edit.value)).length === 0}
            label={t("Save changes", "حفظ التغييرات")}
            onPress={() => void save()}
          />
          <Button secondary disabled={busy} label={t("Discard edits", "تجاهل التعديلات")} onPress={() => void cancel()} />
          <Txt variant="meta" muted>
            {disk === "saved"
              ? t("Edits saved on this device. Tap Save changes to update MARKOS.", "التعديلات محفوظة على الجهاز. اضغط حفظ التغييرات لتحديث ماركوس.")
              : disk === "saving"
                ? t("Saving on this device…", "جارٍ الحفظ على الجهاز…")
                : t("Device save failed. Keep this screen open and retry.", "تعذّر الحفظ على الجهاز. أبقِ هذه الشاشة مفتوحة وأعد المحاولة.")}
          </Txt>
          {disk === "error" ? <Button secondary label={t("Retry device save", "إعادة الحفظ على الجهاز")} onPress={() => change(edit)} /> : null}
        </>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Row>
              {groups.map((g, i) => (
                <Button key={i} secondary={group !== i} label={t(...g.label)} onPress={() => setGroup(i)} />
              ))}
            </Row>
          </ScrollView>
          {groups[group]!.modules.map((m) => (
            <Card key={m}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt variant="heading">{t(...labels[m])}</Txt>
                <Button
                  secondary
                  icon={Pencil}
                  label={t("Edit", "تعديل")}
                  onPress={() => {
                    const base = fromKnowledge(value)[m];
                    change({ module: m, baseVersion: knowledgeVersion(value, m), base, value: base });
                  }}
                />
              </Row>
              {fields[m]
                .filter((f) => !["offerings", "competitors"].includes(f.kind ?? ""))
                .map((field) => {
                  const text = display(fromKnowledge(value)[m][field.key]);
                  return text ? (
                    <View key={field.key} style={{ gap: 4 }}>
                      <Txt variant="label">{t(...field.label)}</Txt>
                      <Txt muted>{text}</Txt>
                    </View>
                  ) : null;
                })}
              {m === "products" ? (
                <>
                  <Button
                    secondary
                    icon={Plus}
                    label={t("Add product or service", "إضافة منتج أو خدمة")}
                    onPress={() =>
                      change({
                        module: "products",
                        baseVersion: knowledgeVersion(value, "products"),
                        base: {},
                        value: { name: "", kind: "UNSPECIFIED", currency: "BHD", priceType: "UNSPECIFIED", status: "ACTIVE" },
                        offering: true
                      })
                    }
                  />
                  {value.catalog?.offerings
                    .filter((o) => o.status !== "ARCHIVED")
                    .map((o) => (
                      <Card key={o.id}>
                        <Txt variant="label">{o.name}</Txt>
                        {o.description ? <Txt muted>{o.description}</Txt> : null}
                        <Button
                          secondary
                          label={t("Edit offering", "تعديل العرض")}
                          onPress={() => {
                            const base = o as unknown as Values;
                            change({ module: "products", baseVersion: knowledgeVersion(value, m), base, value: base, offering: true, offeringId: o.id });
                          }}
                        />
                      </Card>
                    ))}
                </>
              ) : null}
            </Card>
          ))}
        </>
      )}
      <WebButton label={t("Open full profile on web", "فتح الملف الكامل على الموقع")} path="app/knowledge" />
    </Screen>
  );
}
