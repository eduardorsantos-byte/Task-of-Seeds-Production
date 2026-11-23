import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Campo com rótulo, dica e erro acessíveis (aria-describedby). */
export function FormField({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | string[];
  className?: string;
  children: React.ReactNode;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !message && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {message && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
