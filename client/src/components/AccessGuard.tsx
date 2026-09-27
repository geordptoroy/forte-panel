import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PanelLayout, { EmptyState, PageLink } from "@/components/PanelLayout";

type Requirement = "manager" | "administrator" | "fullAgenda" | "financial";

/**
 * Client-side gate for administrative routes. It is a usability layer only:
 * the same rule is enforced again on the server, so typing the URL directly
 * never bypasses the authorization.
 */
export default function AccessGuard({ requirement, children, title }: { requirement: Requirement; children: ReactNode; title: string }) {
  const { data: access, isLoading } = trpc.auth.access.useQuery();
  const allowed = requirement === "administrator"
    ? Boolean(access?.canManageTeam)
    : requirement === "fullAgenda"
      ? Boolean(access?.canSeeFullAgenda)
      : requirement === "financial"
        ? Boolean(access?.canRegisterPayments)
      : Boolean(access?.canManageCatalog);

  if (isLoading) {
    return <PanelLayout eyebrow="Verificando acesso" title={title} description="Confirmando suas permissões neste workspace.">
      <EmptyState icon={ShieldAlert} title="Verificando permissões" description="Aguarde enquanto validamos o seu papel no workspace." />
    </PanelLayout>;
  }

  if (!allowed) {
    return <PanelLayout eyebrow="Acesso restrito" title={title} description="Seu perfil não possui permissão para abrir esta área.">
      <EmptyState icon={ShieldAlert} title="Área restrita" description={requirement === "financial" ? "Somente responsáveis autorizados podem consultar e registrar recebimentos." : "Esta tela é exclusiva de proprietário, administrador ou gerente. Peça a um responsável para liberar o seu acesso."} />
      <div style={{ marginTop: 15, textAlign: "center" }}>
        <PageLink href={access?.restrictedToOwnAgenda ? "/my-work" : "/settings"} className="btn-primary">Voltar para a sua área</PageLink>
      </div>
    </PanelLayout>;
  }

  return <>{children}</>;
}

export function PlatformOnlyGuard({ children, title }: { children: ReactNode; title: string }) {
  const { data: access, isLoading } = trpc.auth.access.useQuery();
  if (isLoading)
    return <PanelLayout eyebrow="Verificando acesso" title={title} description="Confirmando o acesso ao painel administrativo.">
      <EmptyState icon={ShieldAlert} title="Verificando permissões" description="Aguarde enquanto validamos o acesso de suporte." />
    </PanelLayout>;
  if (!access?.platform)
    return <PanelLayout eyebrow="Acesso restrito" title={title} description="Esta área não pertence ao painel operacional comum.">
      <EmptyState icon={ShieldAlert} title="Área exclusiva do suporte" description="Chaves, prompt e ações destrutivas só podem ser administrados pelo console de suporte." />
      <div style={{ marginTop: 15, textAlign: "center" }}><PageLink href="/" className="btn-primary">Voltar ao atendimento</PageLink></div>
    </PanelLayout>;
  return <>{children}</>;
}

export function OnboardingGuard({ children, title }: { children: ReactNode; title: string }) {
  const { data: access, isLoading } = trpc.auth.access.useQuery();
  if (isLoading)
    return <PanelLayout eyebrow="Verificando acesso" title={title} description="Confirmando o acesso à configuração da empresa.">
      <EmptyState icon={ShieldAlert} title="Verificando permissões" description="Aguarde enquanto validamos o seu papel no workspace." />
    </PanelLayout>;
  if (!access?.platform && !access?.canManageTeam)
    return <PanelLayout eyebrow="Acesso restrito" title={title} description="A configuração da empresa exige permissão administrativa.">
      <EmptyState icon={ShieldAlert} title="Área restrita" description="Somente proprietário ou administrador podem configurar o onboarding da empresa." />
      <div style={{ marginTop: 15, textAlign: "center" }}><PageLink href="/settings" className="btn-primary">Voltar para configurações</PageLink></div>
    </PanelLayout>;
  return <>{children}</>;
}
