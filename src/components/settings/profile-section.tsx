"use client";

import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/layout/form-field";
import { renameWorkspace, updateProfile } from "@/features/workspaces/actions";
import { SettingsSection } from "./section";

export function ProfileSection({ fullName, email, theme }: { fullName: string; email: string; theme: "light" | "dark" | "system" }) {
  const { setTheme } = useTheme();
  const [name, setName] = useState(fullName);
  const [pref, setPref] = useState(theme);
  const [pending, start] = useTransition();
  return (
    <SettingsSection title="Perfil" description="Como você aparece para a equipe.">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updateProfile({ full_name: name, theme: pref });
            if (!r.ok) return void toast.error(r.error);
            setTheme(pref);
            toast.success("Perfil salvo");
          });
        }}
      >
        <FormField id="pf-name" label="Nome">
          <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </FormField>
        <FormField id="pf-email" label="E-mail" hint="Definido pelo login; não pode ser alterado aqui.">
          <Input id="pf-email" value={email} disabled />
        </FormField>
        <FormField id="pf-theme" label="Tema">
          <Select value={pref} onValueChange={(v) => setPref(v as typeof pref)}>
            <SelectTrigger id="pf-theme" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Claro</SelectItem>
              <SelectItem value="dark">Escuro</SelectItem>
              <SelectItem value="system">Seguir o sistema</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <Button type="submit" className="justify-self-start" disabled={pending}>
          Salvar perfil
        </Button>
      </form>
    </SettingsSection>
  );
}

export function WorkspaceSection({ name, timezone, canEdit }: { name: string; timezone: string; canEdit: boolean }) {
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  return (
    <SettingsSection title="Workspace" description="Nome e fuso usados para prazos e alertas.">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await renameWorkspace({ name: value });
            if (!r.ok) toast.error(r.error);
            else toast.success("Workspace salvo");
          });
        }}
      >
        <FormField id="ws-name" label="Nome">
          <Input id="ws-name" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit} maxLength={80} />
        </FormField>
        <FormField id="ws-tz" label="Fuso horário" hint="Prazos vencem à meia-noite deste fuso.">
          <Input id="ws-tz" value={timezone} disabled />
        </FormField>
        {canEdit && (
          <Button type="submit" className="justify-self-start" disabled={pending}>
            Salvar workspace
          </Button>
        )}
      </form>
    </SettingsSection>
  );
}
