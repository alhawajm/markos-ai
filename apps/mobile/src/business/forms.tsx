import React from "react";
import { View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { useAppearance } from "../providers";
import { Button, Card, Field, Txt } from "../ui";
import { display, fields, listedPrice, records, type Module, type Values } from "./model";

export function ModuleForm({
  module,
  value,
  onChange,
  disabled = false,
  catalogOnly = false
}: {
  module: Module;
  value: Values;
  onChange: (v: Values) => void;
  disabled?: boolean;
  catalogOnly?: boolean;
}) {
  const { t } = useAppearance();
  return (
    <View style={{ gap: 20 }}>
      {fields[module]
        .filter((field) => !catalogOnly || field.kind !== "offerings")
        .map((field) => {
          const update = (v: unknown) => onChange({ ...value, [field.key]: v });
          if (field.kind === "offerings" || field.kind === "competitors")
            return <Collection key={field.key} value={records(value[field.key])} products={field.kind === "offerings"} onChange={update} disabled={disabled} />;
          return (
            <Field
              key={field.key}
              label={t(...field.label)}
              value={display(value[field.key])}
              editable={!disabled}
              multiline={field.kind === "long" || field.kind === "list"}
              maxLength={field.max}
              autoCapitalize={field.key === "website" ? "none" : "sentences"}
              hint={field.kind === "list" ? t("One item per line", "عنصر واحد في كل سطر") : undefined}
              onChangeText={(text) => update(field.kind === "list" ? text.split("\n") : text)}
            />
          );
        })}
    </View>
  );
}
function Collection({ value, onChange, products, disabled }: { value: Values[]; onChange: (v: Values[]) => void; products: boolean; disabled: boolean }) {
  const { t } = useAppearance();
  return (
    <View style={{ gap: 16 }}>
      <Txt variant="heading">{products ? t("Products & services", "المنتجات والخدمات") : t("Competitors", "المنافسون")}</Txt>
      {value.map((item, index) => (
        <Card key={typeof item.id === "string" ? item.id : index}>
          <Field
            label={t("Name", "الاسم")}
            value={display(item.name)}
            maxLength={160}
            editable={!disabled}
            onChangeText={(name) => onChange(value.map((row, i) => (i === index ? { ...row, name } : row)))}
          />
          {(products ? ["description", "category"] : ["notes", "website", "instagramHandle"]).map((key) => (
            <Field
              key={key}
              label={
                key === "description"
                  ? t("Description", "الوصف")
                  : key === "category"
                    ? t("Category", "الفئة")
                    : key === "notes"
                      ? t("Notes", "ملاحظات")
                      : key === "website"
                        ? t("Website", "الموقع الإلكتروني")
                        : t("Instagram handle", "حساب إنستغرام")
              }
              value={display(item[key])}
              editable={!disabled}
              multiline={key === "description" || key === "notes"}
              maxLength={key === "category" ? 120 : key === "instagramHandle" ? 80 : 1000}
              onChangeText={(text) => onChange(value.map((row, i) => (i === index ? { ...row, [key]: text } : row)))}
            />
          ))}
          {products ? (
            <>
              <View style={{ gap: 8 }}>
                {(["UNSPECIFIED", "PRODUCT", "SERVICE"] as const).map((kind) => (
                  <Button
                    key={kind}
                    disabled={disabled}
                    secondary={item.kind !== kind}
                    label={kind === "PRODUCT" ? t("Product", "منتج") : kind === "SERVICE" ? t("Service", "خدمة") : t("Not specified", "غير محدد")}
                    onPress={() => onChange(value.map((row, i) => (i === index ? { ...row, kind } : row)))}
                  />
                ))}
              </View>
              {typeof item.priceMinor === "number" ? (
                <Txt>
                  {t("Listed price", "السعر المدرج")}: {listedPrice(item)}
                </Txt>
              ) : null}
              {typeof item.priceMinor === "number" ? (
                <Button
                  secondary
                  disabled={disabled}
                  label={t("Remove listed price", "إزالة السعر المدرج")}
                  onPress={() => onChange(value.map((row, i) => (i === index ? { ...row, priceMinor: undefined, priceType: "UNSPECIFIED" } : row)))}
                />
              ) : null}
            </>
          ) : null}
          <Button secondary disabled={disabled} icon={Trash2} label={t("Remove", "إزالة")} onPress={() => onChange(value.filter((_, i) => i !== index))} />
        </Card>
      ))}
      <Button
        secondary
        disabled={disabled || value.length >= (products ? 500 : 20)}
        icon={Plus}
        label={products ? t("Add product or service", "إضافة منتج أو خدمة") : t("Add competitor", "إضافة منافس")}
        onPress={() => onChange([...value, products ? { name: "", kind: "UNSPECIFIED", currency: "BHD" } : { name: "" }])}
      />
    </View>
  );
}
