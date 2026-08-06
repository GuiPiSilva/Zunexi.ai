import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Loader2, LockKeyhole, Sparkles } from "lucide-react";
import { getAccessCreditStatus, type CreditStatus } from "@/lib/access.functions";
import { getAccessKey } from "@/lib/session";
import type { PlanFeature } from "@/lib/plans";

export function PlanGate({ feature, children }: { feature: PlanFeature; children: ReactNode }) {
  const getStatus = useServerFn(getAccessCreditStatus);
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = getAccessKey();
    if (!key) { setLoading(false); return; }
    getStatus({ data: { key } }).then(setStatus).catch(() => setStatus(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="grid min-h-[55vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (status?.features.includes(feature)) return <>{children}</>;

  return (
    <div className="page-wrap">
      <section className="premium-gate panel relative overflow-hidden p-8 sm:p-12">
        <div className="premium-gate-grid" />
        <div className="relative max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.18em] text-primary"><LockKeyhole className="h-3.5 w-3.5" /> Recurso premium</div>
          <h1 className="section-title text-4xl leading-tight sm:text-6xl">Sua próxima fase criativa começa aqui.</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">Este recurso está disponível nos planos Profissional e Agência. Seu plano atual é <strong className="text-foreground">{status?.planName || "Essencial"}</strong>.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="https://studios-zunexi.vercel.app/#planos" className="primary-button" target="_blank" rel="noreferrer">Ver planos <ArrowUpRight className="h-4 w-4" /></a>
            <Link to="/" className="secondary-button"><Sparkles className="h-4 w-4" /> Voltar ao painel</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
