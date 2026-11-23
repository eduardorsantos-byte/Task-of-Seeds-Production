"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { createWorkspace } from "@/features/workspaces/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/layout/form-field";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createWorkspace, {});
  return (
    <form action={action} className="grid gap-4">
      <FormField id="name" label="Nome do workspace" hint="Ex.: Custos de Produção" error={state.error}>
        <Input id="name" name="name" required maxLength={80} autoFocus />
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Criar workspace
      </Button>
    </form>
  );
}
