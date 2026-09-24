import React from "react";
import { Tabs } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { House, Target, Palette, CalendarDays, ChartNoAxesColumn, type LucideIcon } from "lucide-react-native";
import { useAppearance } from "../../src/providers";
import { Txt, WorkspaceHeader } from "../../src/ui";

export default function TabLayout() {
  const { colors, rtl, t } = useAppearance();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const rail = width >= 768;
  const destinations: Record<string, { label: string; icon: LucideIcon }> = {
    index: { label: t("Overview", "الرئيسية"), icon: House },
    campaigns: { label: t("Campaigns", "الحملات"), icon: Target },
    create: { label: t("Create", "إنشاء"), icon: Palette },
    calendar: { label: t("Calendar", "التقويم"), icon: CalendarDays },
    insights: { label: t("Insights", "الأداء"), icon: ChartNoAxesColumn }
  };
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        header: () => <WorkspaceHeader />,
        sceneStyle: { backgroundColor: colors.background },
        tabBarPosition: rail ? (rtl ? "right" : "left") : "bottom",
        animation: "none"
      }}
      tabBar={({ state, navigation }) => (
        <View
          style={{
            flexDirection: rail ? "column" : rtl ? "row-reverse" : "row",
            width: rail ? 108 : undefined,
            backgroundColor: colors.surface,
            borderTopWidth: rail ? 0 : 1,
            borderColor: colors.border,
            padding: 8,
            paddingTop: rail ? insets.top + 20 : 8,
            paddingBottom: Math.max(insets.bottom, 8),
            gap: rail ? 12 : 0
          }}
        >
          {state.routes.map((route, index) => {
            const item = destinations[route.name];
            if (!item) return null;
            const selected = state.index === index;
            const Icon = item.icon;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                onPress={() => {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
                }}
                onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                style={({ pressed }) => ({
                  flex: rail ? undefined : 1,
                  minHeight: 64,
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 2,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: selected ? colors.secondarySoft : pressed ? colors.surfaceMuted : "transparent"
                })}
              >
                <Icon size={24} color={selected ? colors.accent : colors.muted} strokeWidth={1.5} />
                <Txt variant="meta" style={{ textAlign: "center", color: selected ? colors.text : colors.muted, fontSize: 12 }}>
                  {item.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="campaigns" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="insights" />
    </Tabs>
  );
}
