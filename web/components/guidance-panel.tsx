import { Heart, MessageCircleMore, Repeat2, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type GuidancePanelProps = {
  compact?: boolean;
};

const guidanceItems = [
  {
    icon: Heart,
    label: "Like",
    text: "Use when the post directly supports the campaign, product message, or account priorities."
  },
  {
    icon: Repeat2,
    label: "Repost",
    text: "Share only when the angle is useful for your audience and aligned with current positioning."
  },
  {
    icon: MessageCircleMore,
    label: "Comment",
    text: "Add a concrete point of view, result, or example. Avoid generic comments like “Great post”."
  },
  {
    icon: Sparkles,
    label: "Mention",
    text: "Mention a relevant partner or agency only when the relationship is genuine and adds context."
  }
];

export function GuidancePanel({ compact = true }: GuidancePanelProps) {
  return (
    <Card className="border-dashed border-border/80 bg-secondary/35">
      <CardHeader className={compact ? "pb-3" : "pb-4"}>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Internal only
        </p>
        <CardTitle
          className={cn(
            "text-lg font-semibold text-foreground",
            !compact && "text-xl"
          )}
        >
          Engagement guidance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {guidanceItems.map(({ icon: Icon, label, text }) => (
          <div
            key={label}
            className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card/70 p-3"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-sm leading-6 text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
