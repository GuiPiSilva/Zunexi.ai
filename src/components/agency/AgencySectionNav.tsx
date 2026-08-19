import { Link } from "@tanstack/react-router";
import { BriefcaseBusiness, Building2, Clock3, ListChecks } from "lucide-react";

const items = [
  { to: "/agencia" as const, label: "Visão geral", icon: BriefcaseBusiness },
  { to: "/agencia/clientes" as const, label: "Clientes", icon: Building2 },
  { to: "/agencia/tarefas" as const, label: "Tarefas", icon: ListChecks },
  { to: "/agencia/historico" as const, label: "Histórico", icon: Clock3 },
];

export function AgencySectionNav() {
  return (
    <nav className="panel flex gap-1 overflow-x-auto p-1.5" aria-label="Navegação da Agência 360">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/agencia" }}
            className="flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground data-[status=active]:bg-primary/15 data-[status=active]:text-foreground"
          >
            <Icon className="h-4 w-4 data-[status=active]:text-primary" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
