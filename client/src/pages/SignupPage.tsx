import { FormEvent, useState } from "react";
import { Building2, LockKeyhole, UserPlus } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const TERMS_VERSION = "2026-09-27.v1";

export default function SignupPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const signup = trpc.auth.signup.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.auth.me.invalidate(),
        utils.auth.access.invalidate(),
      ]);
      navigate("/whatsapp-connection");
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptTerms || !acceptPrivacy) {
      toast.error("Aceite os Termos de Uso e o Aviso de Privacidade para continuar.");
      return;
    }
    signup.mutate({
      name,
      email,
      workspaceName,
      password,
      acceptTerms: true,
      acceptPrivacy: true,
    });
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-mark"><Building2 size={18} /></div>
        <span className="eyebrow">Forte Panel / Primeiro acesso</span>
        <h1>Crie sua empresa</h1>
        <p>Cadastre o owner e o workspace inicial. Você poderá convidar sua equipe depois.</p>
        <form onSubmit={submit} className="auth-form">
          <label className="form-field"><span>Seu nome</span><input className="input-control" type="text" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required /></label>
          <label className="form-field"><span>E-mail de trabalho</span><input className="input-control" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label className="form-field"><span>Nome da empresa</span><input className="input-control" type="text" autoComplete="organization" value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} required /></label>
          <label className="form-field"><span>Senha</span><input className="input-control" type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /><small className="muted">Use pelo menos 8 caracteres.</small></label>
          <label className="auth-consent"><input type="checkbox" checked={acceptTerms} onChange={event => setAcceptTerms(event.target.checked)} required /> <span>Aceito os Termos de Uso, versão {TERMS_VERSION}.</span></label>
          <label className="auth-consent"><input type="checkbox" checked={acceptPrivacy} onChange={event => setAcceptPrivacy(event.target.checked)} required /> <span>Estou de acordo com o Aviso de Privacidade, versão {TERMS_VERSION}.</span></label>
          <button className="btn-primary auth-submit" type="submit" disabled={signup.isPending}><UserPlus size={14} /> {signup.isPending ? "Criando workspace..." : "Criar minha empresa"}</button>
        </form>
        <small className="auth-footnote"><LockKeyhole size={13} /> Sua conta será criada como owner deste workspace. Já possui acesso? <Link href="/login">Entrar</Link></small>
      </section>
    </main>
  );
}
