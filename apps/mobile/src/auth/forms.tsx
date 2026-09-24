import React, { type PropsWithChildren, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, EyeOff } from "lucide-react-native";
import { useAppearance } from "../providers";
import { Button, Field, IconButton, Row, Screen, Txt } from "../ui";
export function AuthScreen({ children, title, description }: PropsWithChildren<{ title: string; description: string }>) {
  const { colors, locale, setPreferences } = useAppearance();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt variant="heading">MARKOS</Txt>
          <Button secondary label={locale === "en" ? "العربية" : "English"} onPress={() => void setPreferences({ locale: locale === "en" ? "ar" : "en" })} />
        </Row>
        <Txt variant="title">{title}</Txt>
        <Txt muted>{description}</Txt>
        {children}
      </Screen>
    </SafeAreaView>
  );
}
export function PasswordField({
  label,
  value,
  onChange,
  disabled = false,
  hint
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { t } = useAppearance();
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <Field
        label={label}
        value={value}
        onChangeText={onChange}
        hint={hint}
        editable={!disabled}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={128}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Row style={{ justifyContent: "flex-end" }}>
        <IconButton
          disabled={disabled}
          label={visible ? t("Hide password", "إخفاء كلمة المرور") : t("Show password", "إظهار كلمة المرور")}
          icon={visible ? EyeOff : Eye}
          onPress={() => setVisible(!visible)}
        />
      </Row>
    </View>
  );
}
