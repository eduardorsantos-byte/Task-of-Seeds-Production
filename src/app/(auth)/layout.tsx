import { Mark } from "@/components/layout/mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <Mark />
          <span className="text-[15px] font-semibold tracking-tight">Safra ADM</span>
        </div>
        {children}
      </div>
    </main>
  );
}

