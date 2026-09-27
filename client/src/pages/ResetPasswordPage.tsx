import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function ResetPasswordPage() {
  const [location, navigate] = useLocation();
  const token = useMemo(
    () => new URLSearchParams(location.split("?")[1] ?? "").get("token") ?? "",
    [location]
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const reset = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Senha redefinida. Faça login com a nova senha.");
      navigate("/login");
    },
    onError: error => toast.error(error.message),
  });
  const canSubmit = token.length >= 40 && password.length >= 8 && password === confirmation;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    reset.mutate({ token, password });
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-mark"><KeyRound size={18} /></div>
        <span className="eyebrow">Forte Panel / Nova senha</span>
        <h1>Defina uma nova senha</h1>
        {!token ? (
          <div className="demo-banner">Este link de recuperação está incompleto.</div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <p>O link é individual, expira em 30 minutos e não pode ser usado novamente depois do reset.</p>
            <label className="form-field"><span>Nova senha</span><input className="input-control" type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /><small>Mínimo de 8 caracteres.</small></label>
            <label className="form-field"><span>Repita a senha</span><input className="input-control" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>
            {confirmation && password !== confirmation && <small className="form-error">As senhas não coincidem.</small>}
            <button className="btn-primary auth-submit" type="submit" disabled={reset.isPending || !canSubmit}><CheckCircle2 size={14} /> {reset.isPending ? "Salvando..." : "Redefinir senha"}</button>
          </form>
        )}
        <small className="auth-footnote">Depois do reset, as sessões anteriores são revogadas automaticamente.</small>
      </section>
    </main>
  );
}
