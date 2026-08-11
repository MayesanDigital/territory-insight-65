import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  loading?: boolean;
}) {
  return (
    <Card className="border-border/80">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          {Icon && <Icon className="h-4 w-4 text-primary" />}
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-24" />
        ) : (
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</p>
        )}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
