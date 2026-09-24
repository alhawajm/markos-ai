import React from "react";
import { View } from "react-native";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react-native";
import type { ContentAuthoringOperation, ContentRecord } from "@markos/shared-types";
import { useAppearance } from "../providers";
import { Button, Card, Field, IconButton, Row, Txt } from "../ui";

export function ReelScript({
  item,
  disabled,
  edit,
  mutate
}: {
  item: ContentRecord;
  disabled: boolean;
  edit: (item: ContentRecord) => void;
  mutate: (operations: ContentAuthoringOperation[]) => Promise<void>;
}) {
  const { t } = useAppearance();
  const script = item.reelScript;
  function move(id: string, delta: number) {
    const ids = script!.beats.map((beat) => beat.id),
      index = ids.indexOf(id);
    [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
    void mutate([{ type: "reorderReelBeats", orderedIds: ids }]);
  }
  if (!script)
    return (
      <Button
        secondary
        icon={Plus}
        disabled={disabled}
        label={t("Add Reel script", "إضافة نص الريل")}
        onPress={() => void mutate([{ type: "updateReelScript", fields: { hook: "" } }])}
      />
    );
  return (
    <Card>
      <Txt variant="heading">{t("Reel script", "نص الريل")}</Txt>
      <Field
        label={t("Hook", "المقدمة")}
        value={script.hook ?? ""}
        maxLength={300}
        editable={!disabled}
        multiline
        onChangeText={(hook) => edit({ ...item, reelScript: { ...script, hook } })}
      />
      <Field
        label={t("Intended duration (seconds)", "المدة المقصودة (ثوانٍ)")}
        value={script.intendedDurationSeconds?.toString() ?? ""}
        keyboardType="number-pad"
        maxLength={4}
        editable={!disabled}
        onChangeText={(value) => {
          if (/^\d*$/.test(value) && (!value || (Number(value) > 0 && Number(value) <= 3600)))
            edit({ ...item, reelScript: { ...script, intendedDurationSeconds: value ? Number(value) : null } });
        }}
        hint={t("A planning note. Generation duration is chosen in Media.", "ملاحظة للتخطيط. تُختار مدة التوليد من الوسائط.")}
      />
      {script.beats.map((beat, index) => (
        <View key={beat.id} style={{ gap: 8 }}>
          <Field
            label={`${t("Scene", "المشهد")} ${index + 1}`}
            value={beat.text}
            maxLength={800}
            multiline
            editable={!disabled}
            onChangeText={(text) =>
              edit({ ...item, reelScript: { ...script, beats: script.beats.map((entry) => (entry.id === beat.id ? { ...entry, text } : entry)) } })
            }
          />
          <Row>
            <IconButton icon={ArrowUp} label={t("Move scene earlier", "تقديم المشهد")} disabled={disabled || index === 0} onPress={() => move(beat.id, -1)} />
            <IconButton
              icon={ArrowDown}
              label={t("Move scene later", "تأخير المشهد")}
              disabled={disabled || index === script.beats.length - 1}
              onPress={() => move(beat.id, 1)}
            />
            <IconButton
              icon={Trash2}
              label={t("Remove scene", "إزالة المشهد")}
              disabled={disabled}
              onPress={() => void mutate([{ type: "removeReelBeat", beatId: beat.id }])}
            />
          </Row>
        </View>
      ))}
      <Button
        secondary
        icon={Plus}
        disabled={disabled || script.beats.length >= 100}
        label={t("Add scene", "إضافة مشهد")}
        onPress={() => void mutate([{ type: "addReelBeat", text: t("New scene", "مشهد جديد") }])}
      />
    </Card>
  );
}
