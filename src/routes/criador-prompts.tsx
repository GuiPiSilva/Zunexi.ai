import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Copy, Loader2, MessageSquareText, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { generateCarouselPrompt, type CarouselPromptData } from "@/lib/groq.functions";
import { getAccessKey } from "@/lib/session";

export const Route = createFileRoute("/criador-prompts")({
  head: () => ({ meta: [{ title: "Criador de prompts | Zunexi.ai" }] }),
  component: PromptCreatorPage,
});

function PromptCreatorPage() {
  const navigate = useNavigate();
  const generate = useServerFn(generateCarouselPrompt);
  const [accessKey, setAccessKey] = useState("");
  const [pedido, setPedido] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generatedData, setGeneratedData] = useState<CarouselPromptData | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const key = getAccessKey();
    if (!key) {
      navigate({ to: "/acesso", replace: true });
      return;
    }
    setAccessKey(key);
  }, [navigate]);

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !accessKey) return;
    if (pedido.trim().length < 3) {
      toast.error("Digite o que você deseja criar.");
      return;
    }

    setBusy(true);
    try {
      const result = await generate({ data: { accessKey, pedido } });
      setPrompt(result.prompt);
      setGeneratedData(result);
      toast.success("Prompt criado com sucesso.");
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível criar o prompt.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    toast.success("Prompt copiado.");
  }

  function sendToCarousel() {
    if (!prompt) {
      toast.error("Crie um prompt primeiro.");
      return;
    }
    const payload = generatedData ? { ...generatedData, prompt } : { prompt, tema: prompt };
    sessionStorage.setItem("inlabs_carousel_prompt_data", JSON.stringify(payload));
    navigate({ to: "/carrossel" });
  }

  return (
    <AppShell>
      <div className="page-wrap">
        <section className="mx-auto max-w-5xl">
          <div className="mb-7 text-center">
            <div className="eyebrow mb-3">Assistente inteligente</div>
            <h1 className="section-title text-3xl sm:text-4xl">Crie seu prompt em segundos</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Explique de forma simples o que deseja. A IA transforma sua ideia em um prompt completo para o criador de carrosséis.
            </p>
          </div>

          <form onSubmit={handleGenerate} className="panel p-5 sm:p-7">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <MessageSquareText className="h-4 w-4 text-primary" /> O que você quer criar?
              </span>
              <textarea
                value={pedido}
                onChange={(event) => setPedido(event.target.value)}
                rows={6}
                maxLength={500}
                placeholder="Ex.: Quero um carrossel de 5 imagens para uma loja de carros, com estilo premium, cores preto e laranja, mostrando ofertas e um CTA para o WhatsApp."
                className="app-input resize-y"
              />
              <div className="mt-2 text-right text-[11px] text-muted-foreground">{pedido.length}/500</div>
            </label>

            <button type="submit" disabled={busy} className="primary-button mt-5 w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {busy ? "Criando prompt..." : "Criar prompt"}
            </button>
          </form>

          <section className="panel mt-6 p-5 sm:p-7">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Prompt gerado</div>
                <p className="mt-1 text-xs text-muted-foreground">Você pode revisar o texto antes de enviá-lo.</p>
              </div>
              <button type="button" onClick={copyPrompt} disabled={!prompt} className="secondary-button disabled:cursor-not-allowed disabled:opacity-40">
                <Copy className="h-4 w-4" /> Copiar
              </button>
            </div>

            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value.slice(0, 500))}
              rows={12}
              placeholder="O prompt criado pela IA aparecerá aqui..."
              maxLength={500}
              className="app-input resize-y"
            />
            <div className="mt-2 text-right text-[11px] text-muted-foreground">{prompt.length}/500</div>

            <button type="button" onClick={sendToCarousel} disabled={!prompt} className="primary-button mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
              Ir para criar carrossel <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        </section>
      </div>
    </AppShell>
  );
}
