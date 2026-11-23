"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { requestPasswordReset, type FormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/layout/form-field";

export default function RecoverPasswordPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, {});
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Redefinir senha</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Enviaremos um link para o seu e-mail.</p>
      {state.message ? (
        <p role="status" className="rounded-md border bg-card px-3 py-2 text-sm">
          {state.message}
        </p>
      ) : (
        <form action={action} className="grid gap-4" noValidate>
          <FormField id="email" label="E-mail" error={state.fieldErrors?.email}>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </FormField>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Enviar link
          </Button>
        </form>
      )}
      <Link href="/login" className="mt-4 block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
        Voltar para o login
      </Link>
    </>
  );
}
