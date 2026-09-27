import { FormEvent, useState } from "react";
import { CheckCircle2, LockKeyhole, UserRound } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function InviteAcceptPage() {
  const [, params] = useRoute("/invite/:token");
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const accept = trpc.auth.acceptInvite.useMutation({
    onSuccess: result => {
      toast.success(`Acesso criado para ${result.email}`);
      navigate("/login");
    },
    onError: error => toast.error(error.message),
  });
  const token = params?.token ?? "";
  const canSubmit = Boolean(token) && name.trim().length >= 2 && password.length >= 8 && password === confirmation;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    accept.mutate({ token, name: name.trim(), password });
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-mark"><UserRound size={18} /></div>
        <span className="eyebrow">Forte Panel / Convite de equipe</span>
        <h1>Configure seu acesso</h1>
        <p>Crie sua senha pessoal para entrar no workspace da empresa. O acesso respeitará o papel definido no convite.</p>
        {!token ? (
          <div className="demo-banner"><LockKeyhole size={14} /> Este link de convite está incompleto.</div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label className="form-field"><span>Seu nome</span><input className="input-control" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required /></label>
            <label className="form-field"><span>Senha</span><input className="input-control" type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /><small>Mínimo de 8 caracteres.</small></label>
            <label className="form-field"><span>Repita a senha</span><input className="input-control" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>
            {confirmation && password !== confirmation && <small className="form-error">As senhas não coincidem.</small>}
            <button className="btn-primary auth-submit" type="submit" disabled={accept.isPending || !canSubmit}><CheckCircle2 size={14} /> {accept.isPending ? "Configurando..." : "Aceitar convite"}</button>
          </form>
        )}
        <small className="auth-footnote">O convite é individual, expira e só pode ser usado uma vez. Se o link não funcionar, peça um novo convite ao responsável pela empresa.</small>
      </section>
    </main>
  );
}
