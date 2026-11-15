export function guidanceOutput(output: Record<string, unknown>) {
  const texts = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  const strategy =
    output.strategy && typeof output.strategy === "object" && !Array.isArray(output.strategy) ? (output.strategy as Record<string, unknown>) : {};
  return {
    summary: typeof output.summary === "string" ? output.summary : "",
    sections: [
      { key: "objectives", title: ["What we’re aiming for", "ما نسعى إليه"] as const, items: texts(strategy.objectives) },
      { key: "pillars", title: ["Your content direction", "توجّه محتواك"] as const, items: texts(strategy.pillars) },
      { key: "nextActions", title: ["What to do next", "الخطوة التالية"] as const, items: texts(strategy.nextActions) },
      {
        key: "insights",
        title: ["What the data tells us", "ما تخبرنا به البيانات"] as const,
        items: Array.isArray(output.insights)
          ? output.insights.flatMap((row) =>
              row && typeof row === "object" && typeof (row as Record<string, unknown>).interpretation === "string"
                ? [(row as { interpretation: string }).interpretation]
                : []
            )
          : []
      },
      { key: "recommendations", title: ["Recommended next steps", "الخطوات التالية المقترحة"] as const, items: texts(output.recommendations) }
    ]
      .filter((section) => section.items.length > 0)
      .sort((left, right) => Number(!["nextActions", "recommendations"].includes(left.key)) - Number(!["nextActions", "recommendations"].includes(right.key))),
    assumptions: texts(output.assumptions),
    missingInformation: texts(output.missingInformation)
  };
}
