import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("E-mail inválido").trim().toLowerCase(),
  password: z.string().min(1, "Informe a senha"),
});

export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "Use ao menos 10 caracteres")
      .max(72, "Máximo de 72 caracteres")
      .regex(/[A-Za-z]/, "Inclua ao menos uma letra")
      .regex(/[0-9]/, "Inclua ao menos um número"),
    confirm: z.string(),
    full_name: z.string().trim().max(120).optional(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não coincidem" });

export const emailSchema = z.object({ email: z.email("E-mail inválido").trim().toLowerCase() });

export const workspaceSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
});

export const inviteSchema = z.object({
  workspace_id: z.uuid(),
  email: z.email("E-mail inválido").trim().toLowerCase(),
  can_validate: z.boolean().default(false),
});

export const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Informe seu nome").max(120),
  theme: z.enum(["light", "dark", "system"]),
});
