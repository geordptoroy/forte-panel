import { FormEvent, useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.localLogin.useMutation({
    onSuccess: async (result) => {
      await utils.auth.me.invalidate();
      await utils.auth.access.invalidate();
      navigate(result.operationalRole === "professional" && result.role === "agent" ? "/my-work" : "/dashboard");
    },
    onError: (error) => toast.error(error.message),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate({ email, password });
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-mark"><LockKeyhole size={18} /></div>
        <span className="eyebrow">Forte Panel / Acesso</span>
        <h1>Entrar no painel</h1>
        <p>Use o acesso criado pelo proprietário da instalação.</p>
        <form onSubmit={submit} className="auth-form">
          <label className="form-field"><span>E-mail</span><input className="input-control" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="form-field"><span>Senha</span><input className="input-control" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="btn-primary auth-submit" type="submit" disabled={login.isPending}><LogIn size={14} /> {login.isPending ? "Entrando..." : "Entrar"}</button>
        </form>
        <small className="auth-footnote">Cada pessoa acessa com o próprio e-mail e senha. A visão do painel muda conforme o papel e o perfil operacional.</small>
      </section>
    </main>
  );
}
