"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { setPassword, type FormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/layout/form-field";

export default function SetPasswordPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(setPassword, {});
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Defina sua senha</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Você usará esta senha para entrar daqui em diante.</p>
      <form action={action} className="grid gap-4" noValidate>
        <FormField id="full_name" label="Seu nome" error={state.fieldErrors?.full_name}>
          <Input id="full_name" name="full_name" autoComplete="name" autoFocus />
        </FormField>
        <FormField id="password" label="Nova senha" hint="Mínimo de 10 caracteres, com letras e números." error={state.fieldErrors?.password}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required aria-describedby="password-hint" />
        </FormField>
        <FormField id="confirm" label="Confirme a senha" error={state.fieldErrors?.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </FormField>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Salvar senha e entrar
        </Button>
      </form>
    </>
  );
}
