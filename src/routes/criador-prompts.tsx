import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Copy, Lightbulb, Loader2, MessageSquareText, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PlanGate } from "@/components/PlanGate";
import { generateBrandContentIdeas, generateCarouselPrompt, type CarouselPromptData } from "@/lib/groq.functions";
import { listBrandProfiles } from "@/lib/brand.functions";
import { getAccessKey } from "@/lib/session";
import type { PlanId } from "@/lib/plans";

export const Route = createFileRoute("/criador-prompts")({
  head: () => ({ meta: [{ title: "Criador de prompts | Zunexi.ai" }] }),
  component: PromptCreatorPage,
});

type Brand = { id: string; name: string; is_primary: boolean };
type Idea = { title: string; angle: string; format: string; objective: string; prompt: string };

function PromptCreatorPage() {
  const navigate = useNavigate();
  const generate = useServerFn(generateCarouselPrompt);
  const generateIdeas = useServerFn(generateBrandContentIdeas);
  const listBrands = useServerFn(listBrandProfiles);
  const [accessKey, setAccessKey] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [plan, setPlan] = useState<PlanId>("profissional");
  const [brandId, setBrandId] = useState("");
  const [pedido, setPedido] = useState("");
  const [textProvider, setTextProvider] = useState<"groq" | "lovable">("groq");
  const [prompt, setPrompt] = useState("");
  const [generatedData, setGeneratedData] = useState<CarouselPromptData | null>(null);
  const [busy, setBusy] = useState(false);
  const [ideaBusy, setIdeaBusy] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideaObjective, setIdeaObjective] = useState("atrair clientes e fortalecer a marca");

  useEffect(() => {
    const key = getAccessKey();
    if (!key) { navigate({ to: "/acesso", replace: true }); return; }
    setAccessKey(key);
    listBrands({ data: { accessKey: key } }).then((result) => {
      const next = result.brands as Brand[];
      setBrands(next);
      setPlan(result.plan);
      setBrandId(next.find((brand) => brand.is_primary)?.id || next[0]?.id || "");
    }).catch(() => undefined);
  }, [navigate]);

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !accessKey) return;
    if (pedido.trim().length < 3) return toast.error("Digite o que você deseja criar.");
    setBusy(true);
    try {
      const result = await generate({ data: { accessKey, pedido, brandId: brandId || null, textProvider } });
      setPrompt(result.prompt);
      setGeneratedData(result);
      toast.success("Prompt criado com o Brand Kit selecionado.");
    } catch (error) { toast.error((error as Error).message || "Não foi possível criar o prompt."); }
    finally { setBusy(false); }
  }

  async function handleIdeas() {
    if (!brandId) return toast.error("Cadastre ou selecione uma marca no Brand Kit.");
    setIdeaBusy(true);
    try {
      const result = await generateIdeas({ data: { accessKey, brandId, objective: ideaObjective, quantity: 8 } });
      setIdeas(result.ideas);
      toast.success("Ideias criadas com base no Brand Kit.");
    } catch (error) { toast.error((error as Error).message); }
    finally { setIdeaBusy(false); }
  }

  async function copyPrompt() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    toast.success("Prompt copiado.");
  }

  function useIdea(idea: Idea) {
    setPedido(idea.prompt);
    setPrompt("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function sendToCarousel() {
    if (!prompt) return toast.error("Crie um prompt primeiro.");
    const payload = generatedData ? { ...generatedData, prompt, brandId } : { prompt, tema: prompt, brandId };
    sessionStorage.setItem("inlabs_carousel_prompt_data", JSON.stringify(payload));
    navigate({ to: "/carrossel" });
  }

  return (
    <AppShell>
      <PlanGate feature="criador_prompts">
        <div className="page-wrap space-y-6">
          <section className="mx-auto max-w-5xl">
            <div className="mb-7 text-center">
              <div className="eyebrow mb-3">Assistente inteligente</div>
              <h1 className="section-title text-3xl sm:text-4xl">Prompts e ideias com a identidade da sua marca</h1>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">Selecione a marca. A Zunexi usa o manual, as cores, o tom, o público e as regras salvas no Brand Kit.</p>
            </div>

            {brands.length > 0 && (
              <div className="panel mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <label><span className="mb-2 block text-xs font-semibold">Marca usada na criação</span><select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="app-input"><option value="">Marca principal</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
                <div className="rounded-xl border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-muted-foreground">{plan === "agencia" ? "Agência: você pode alternar entre várias marcas." : "Brand Kit aplicado automaticamente."}</div>
              </div>
            )}

            <form onSubmit={handleGenerate} className="panel p-5 sm:p-7">
              <div className="mb-5 grid gap-4 sm:grid-cols-[1fr_280px]">
                <div>
                  <div className="text-sm font-semibold">Motor do prompt</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Compare o motor atual da Zunexi com o mesmo GPT-5.6 Sol encontrado no projeto criado pelo Lovable.</p>
                </div>
                <select value={textProvider} onChange={(event) => setTextProvider(event.target.value as "groq" | "lovable")} className="app-input">
                  <option value="groq">Groq — motor atual</option>
                  <option value="lovable">Lovable — GPT-5.6 Sol</option>
                </select>
              </div>
              <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="h-4 w-4 text-primary" /> O que você quer criar?</span><textarea value={pedido} onChange={(event) => setPedido(event.target.value)} rows={7} maxLength={1200} placeholder="Ex.: Quero um carrossel para mostrar por que uma pizzaria perde pedidos quando demora no WhatsApp e como uma automação resolve isso. Público: donos de pizzarias. Tom direto, visual premium e sem pessoas." className="app-input resize-y" /><div className="mt-2 text-right text-[11px] text-muted-foreground">{pedido.length}/1200</div></label>
              <button type="submit" disabled={busy} className="primary-button mt-5 w-full sm:w-auto disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{busy ? "Criando prompt..." : `Criar prompt com ${textProvider === "lovable" ? "Lovable" : "Groq"}`}</button>
            </form>

            <section className="panel mt-6 p-5 sm:p-7">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Prompt gerado</div><p className="mt-1 text-xs text-muted-foreground">O Brand Kit selecionado já está incorporado. O resultado inclui ângulo criativo, narrativa, direção visual, copy e restrições.</p></div><button type="button" onClick={copyPrompt} disabled={!prompt} className="secondary-button disabled:opacity-40"><Copy className="h-4 w-4" /> Copiar</button></div>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value.slice(0, 2400))} rows={10} placeholder="O prompt criado pela IA aparecerá aqui..." maxLength={2400} className="app-input resize-y" />
              <div className="mt-2 text-right text-[11px] text-muted-foreground">{prompt.length}/2400</div>
              <button type="button" onClick={sendToCarousel} disabled={!prompt} className="primary-button mt-5 w-full disabled:opacity-40 sm:w-auto">Ir para criar carrossel <ArrowRight className="h-4 w-4" /></button>
            </section>
          </section>

          <section className="mx-auto max-w-5xl panel p-5 sm:p-7">
            <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <div className="eyebrow mb-2 flex items-center gap-2"><Lightbulb className="h-3.5 w-3.5" /> Gerador de ideias</div>
                <h2 className="section-title text-2xl">Ideias baseadas no Brand Kit</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">A IA cruza os pilares, o público e a linguagem da marca para sugerir conteúdos que fazem sentido para ela.</p>
                <label className="mt-5 block"><span className="mb-2 block text-xs font-semibold">Objetivo do conteúdo</span><input value={ideaObjective} onChange={(event) => setIdeaObjective(event.target.value)} className="app-input" /></label>
                <button type="button" onClick={() => void handleIdeas()} disabled={ideaBusy || !brandId} className="primary-button mt-4 w-full disabled:opacity-50">{ideaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{ideaBusy ? "Criando ideias..." : "Gerar ideias"}</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {ideas.length === 0 ? <div className="sm:col-span-2 grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center text-sm text-muted-foreground">Selecione uma marca e gere ideias personalizadas.</div> : ideas.map((idea, index) => <button key={`${idea.title}-${index}`} onClick={() => useIdea(idea)} className="rounded-2xl border border-border bg-white/[.018] p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"><div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{idea.format} · {idea.objective}</div><h3 className="mt-2 font-semibold">{idea.title}</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{idea.angle}</p><div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary">Usar esta ideia <ArrowRight className="h-3.5 w-3.5" /></div></button>)}
              </div>
            </div>
          </section>
        </div>
      </PlanGate>
    </AppShell>
  );
}
