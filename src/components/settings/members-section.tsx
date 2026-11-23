"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/layout/form-field";
import { UserAvatar } from "@/components/layout/user-avatar";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { displayName } from "@/features/workspaces/display";
import { inviteMember, revokeInvitation, setMemberPermission } from "@/features/workspaces/actions";
import { formatDateTime } from "@/lib/utils/dates";
import { SettingsSection } from "./section";

export function MembersSection({
  canManage,
  invitations,
}: {
  canManage: boolean;
  invitations: { id: string; email: string; created_at: string; expires_at: string }[];
}) {
  const { members, workspace, userId } = useWorkspace();
  const [pending, start] = useTransition();

  return (
    <SettingsSection
      title="Integrantes"
      description="Todos têm as mesmas permissões operacionais. Validar ganhos é uma permissão à parte."
    >
      <ul className="divide-y">
        {members.map((m) => {
          const validator = m.permissions.includes("impacts.validate");
          return (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
              <UserAvatar name={displayName(m.profile)} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {displayName(m.profile)} {m.user_id === userId && <span className="font-normal text-muted-foreground">(você)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.profile.email}
                  {m.permissions.includes("members.manage") && " · administra integrantes"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`val-${m.user_id}`}
                  checked={validator}
                  disabled={!canManage || pending}
                  onCheckedChange={(c) =>
                    start(async () => {
                      const r = await setMemberPermission({ user_id: m.user_id, permission: "impacts.validate", granted: c === true });
                      if (!r.ok) toast.error(r.error);
                    })
                  }
                />
                <Label htmlFor={`val-${m.user_id}`} className="text-sm font-normal">
                  Valida ganhos
                </Label>
              </div>
            </li>
          );
        })}
      </ul>

      {canManage && (
        <div className="mt-4 border-t pt-4">
          <InviteForm workspaceId={workspace.id} />
          {invitations.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Convites pendentes</p>
              <ul className="grid gap-2">
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{i.email}</span>
                    <span className="text-xs text-muted-foreground">expira {formatDateTime(i.expires_at, workspace.timezone)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await revokeInvitation(i.id);
                          if (!r.ok) toast.error(r.error);
                          else toast.success("Convite cancelado");
                        })
                      }
                    >
                      Cancelar convite
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState("");
  const [canValidate, setCanValidate] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setLink(null);
        start(async () => {
          const r = await inviteMember({ workspace_id: workspaceId, email, can_validate: canValidate });
          if (!r.ok) {
            setError(r.fieldErrors?.email?.[0] ?? r.error);
            return;
          }
          setError(undefined);
          if (r.data.existingUser) toast.success("Convite registrado. A pessoa já tem conta e verá o workspace ao entrar.");
          else setLink(r.data.link);
          setEmail("");
        });
      }}
    >
      <FormField id="inv-email" label="Convidar por e-mail" error={error}>
        <div className="flex gap-2">
          <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" required />
          <Button type="submit" disabled={pending || !email}>
            {pending && <Loader2 className="animate-spin" />}
            Gerar convite
          </Button>
        </div>
      </FormField>
      <div className="flex items-center gap-2">
        <Checkbox id="inv-validate" checked={canValidate} onCheckedChange={(c) => setCanValidate(c === true)} />
        <Label htmlFor="inv-validate" className="text-sm font-normal">
          Também pode validar ganhos
        </Label>
      </div>
      {link && (
        <div role="status" className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="mb-2">Envie este link para a pessoa. Ele é pessoal e expira em pouco tempo (padrão do Supabase: 1 hora).</p>
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Link de convite" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
