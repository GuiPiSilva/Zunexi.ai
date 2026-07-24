import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowRight,
  KeyRound,
  LifeBuoy,
  Loader2,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import logoFull from "@/assets/logo-full.png";
import logoIcon from "@/assets/logo-icon.png";
import { setAccessKey, setAccessUserName } from "@/lib/session";
import { verifyAccessKey } from "@/lib/access.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/acesso")({
  head: () => ({
    meta: [
      {
        title: "Acesso — InLabs.Ia Studios",
      },
      {
        name: "description",
        content:
          "Entre no InLabs.Ia Studios usando uma chave liberada pelo administrador.",
      },
    ],
  }),
  component: Access,
});

function Access() {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const nav = useNavigate();
  const verify = useServerFn(verifyAccessKey);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (busy) {
      return;
    }

    const normalizedKey = key.trim().toUpperCase();

    if (!normalizedKey) {
      toast.error("Digite sua chave de acesso.");
      return;
    }

    setBusy(true);

    try {
      const result = await verify({
        data: {
          key: normalizedKey,
        },
      });

      if (!result.ok) {
        toast.error("Chave inválida, bloqueada ou expirada.");
        return;
      }

      setAccessKey(normalizedKey);
      setAccessUserName(result.name);

      toast.success(`Acesso autorizado para ${result.name}.`);

      nav({
        to: "/",
        replace: true,
      });
    } catch (error) {
      toast.error(
        (error as Error).message ||
          "Não foi possível validar a chave de acesso.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050711] px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_circle_at_17%_58%,rgba(124,58,237,.24),transparent_58%),radial-gradient(760px_circle_at_82%_50%,rgba(37,99,235,.14),transparent_62%)]" />

      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:56px_56px]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[.85fr_1.15fr]">
        <section className="hidden lg:block">
          <div className="relative mx-auto flex aspect-square max-w-[430px] items-center justify-center">
            <div className="absolute inset-[10%] rounded-full border border-primary/20" />

            <div className="absolute inset-[20%] rounded-full border border-accent/15" />

            <div className="absolute inset-[31%] rounded-full border border-white/10" />

            <div className="absolute h-72 w-72 rounded-full bg-primary/20 blur-[90px]" />

            <div className="relative grid h-64 w-64 place-items-center overflow-hidden rounded-[48px] border border-primary/35 bg-gradient-to-br from-primary/20 via-[#11172a] to-accent/15 p-5 shadow-[0_35px_100px_rgba(72,33,186,.35)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(139,92,246,.18),transparent_60%)]" />

              <img
                src={logoIcon}
                alt="Símbolo InLabs.Ia Studios"
                className="relative h-full w-full scale-[1.08] object-contain drop-shadow-[0_22px_45px_rgba(101,80,255,.42)]"
              />
            </div>

            <span className="absolute left-[14%] top-[18%] h-2 w-2 rounded-full bg-primary shadow-[0_0_20px_6px_rgba(168,85,247,.5)]" />

            <span className="absolute bottom-[22%] right-[10%] h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_20px_6px_rgba(59,130,246,.5)]" />
          </div>

          <div className="mx-auto mt-2 max-w-md text-center">
            <div className="eyebrow mb-3 flex items-center justify-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Conteúdo profissional com IA
            </div>

            <h1 className="section-title text-3xl">
              Seu estúdio criativo, pronto para transformar ideias em conteúdo.
            </h1>
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl">
          <div className="panel relative overflow-hidden border-primary/20 p-6 shadow-[0_35px_120px_rgba(0,0,0,.45)] sm:p-9">
            <div className="pointer-events-none absolute -right-28 -top-28 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />

            <div className="relative">
              <div className="mb-8 flex justify-center">
                <img
                  src={logoFull}
                  alt="InLabs.Ia Studios"
                  className="h-20 w-auto max-w-[390px] object-contain"
                />
              </div>

              <div className="text-center">
                <h2 className="section-title text-3xl">
                  Acesse sua conta
                </h2>

                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Digite o código de acesso fornecido pelo administrador para
                  entrar no InLabs.Ia Studios.
                </p>
              </div>

              <form
                onSubmit={submit}
                className="mt-8 space-y-5"
              >
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    Código de acesso
                  </span>

                  <div className="flex items-center gap-3 rounded-xl border border-border bg-[#0a0e1a] px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
                    <KeyRound className="h-5 w-5 shrink-0 text-primary" />

                    <input
                      value={key}
                      onChange={(event) =>
                        setKey(event.target.value.toUpperCase())
                      }
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="INL-XXXX-XXXX-XXXX"
                      className="h-14 w-full bg-transparent font-mono text-sm tracking-[0.12em] outline-none placeholder:tracking-[0.08em] placeholder:text-muted-foreground"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={busy}
                  className="primary-button h-14 w-full text-base disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <LockKeyhole className="h-5 w-5" />
                  )}

                  {busy ? "Validando acesso..." : "Entrar"}

                  {!busy && (
                    <ArrowRight className="h-5 w-5" />
                  )}
                </button>
              </form>

              <div className="my-7 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                acesso controlado
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <LifeBuoy className="h-4 w-4 shrink-0" />

                <span>
                  Problemas para acessar? Entre em contato com o suporte
                  responsável.
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
