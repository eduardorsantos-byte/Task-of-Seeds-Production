"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">Não foi possível carregar esta tela</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Verifique sua conexão. Se o problema continuar, a conexão com o banco pode estar indisponível.
      </p>
      <Button className="mt-6" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}
