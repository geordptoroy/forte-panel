import { FormEvent, useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const request = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.mutate({ email });
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-mark"><MailCheck size={18} /></div>
        <span className="eyebrow">Forte Panel / Recuperação</span>
        <h1>Recupere seu acesso</h1>
        {sent ? (
          <>
            <p>Se houver uma conta para este e-mail, o provedor configurado enviará instruções para criar uma nova senha. O pedido expira em 30 minutos e o link pode ser usado uma única vez.</p>
            <div className="demo-banner"><MailCheck size={14} /> Verifique sua caixa de entrada e também a pasta de spam. O envio automático ainda depende da configuração do provedor.</div>
          </>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <p>Informe o e-mail da conta. Por segurança, esta tela não revela se o endereço está cadastrado.</p>
            <label className="form-field"><span>E-mail</span><input className="input-control" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
            <button className="btn-primary auth-submit" type="submit" disabled={request.isPending}>{request.isPending ? "Solicitando..." : "Enviar instruções"}</button>
          </form>
        )}
        <small className="auth-footnote"><ArrowLeft size={13} /> <Link href="/login">Voltar para o login</Link></small>
      </section>
    </main>
  );
}
