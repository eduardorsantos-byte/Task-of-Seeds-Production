"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/layout/form-field";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { displayName } from "@/features/workspaces/display";
import { createProject } from "@/features/projects/actions";

const NONE = "__none";

export function NewProjectButton() {
  const { members, userId } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState<string>(userId);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Novo projeto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = Object.fromEntries(new FormData(e.currentTarget));
            start(async () => {
              const r = await createProject({ ...fd, owner_id: owner === NONE ? null : owner });
              if (!r.ok) {
                setErrors(r.fieldErrors ?? {});
                toast.error(r.error);
                return;
              }
              toast.success("Projeto criado");
              setErrors({});
              setOpen(false);
            });
          }}
        >
          <FormField id="p-name" label="Nome" error={errors.name}>
            <Input id="p-name" name="name" required maxLength={200} autoFocus />
          </FormField>
          <FormField id="p-desc" label="Descrição">
            <Textarea id="p-desc" name="description" rows={3} placeholder="Objetivo e escopo" />
          </FormField>
          <FormField id="p-owner" label="Responsável">
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger id="p-owner" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem responsável</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {displayName(m.profile)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="p-start" label="Início">
              <Input id="p-start" name="start_date" type="date" />
            </FormField>
            <FormField id="p-due" label="Prazo" error={errors.due_date}>
              <Input id="p-due" name="due_date" type="date" />
            </FormField>
          </div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Criar projeto
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
