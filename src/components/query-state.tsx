import type { LucideIcon } from "lucide-react";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Estados compartidos de carga, error y vacío.
 *
 * El PRD §25 exige que ningún módulo muestre una pantalla vacía sin
 * explicación. Antes, si una consulta fallaba, el skeleton desaparecía y
 * quedaba un hueco: el usuario no distinguía "no hay datos" de "algo se rompió".
 */

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** Qué se intentaba cargar, para que el mensaje diga algo concreto. */
  what?: string;
  compact?: boolean;
}

export function ErrorState({ error, onRetry, what, compact }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : String(error ?? "Error desconocido");

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 text-center ${
        compact ? "px-4 py-8" : "px-6 py-16"
      }`}
      role="alert"
    >
      <AlertCircle className={compact ? "h-6 w-6 text-destructive" : "h-8 w-8 text-destructive"} />
      <div>
        <p className="font-medium">
          {what ? `No se pudieron cargar ${what}` : "No se pudieron cargar los datos"}
        </p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
        </Button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  compact?: boolean;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-center ${
        compact ? "px-4 py-8" : "px-6 py-16"
      }`}
    >
      <Icon className={compact ? "h-6 w-6 text-muted-foreground" : "h-8 w-8 text-muted-foreground"} />
      <div>
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
