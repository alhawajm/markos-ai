import { forwardRef } from "react";
import { WandSparkles, type LucideProps } from "lucide-react";

export const MarkosAiIcon = forwardRef<SVGSVGElement, LucideProps>(function MarkosAiIcon({ strokeWidth = 2.15, ...props }, ref) {
  return <WandSparkles {...props} ref={ref} strokeWidth={strokeWidth} />;
});
