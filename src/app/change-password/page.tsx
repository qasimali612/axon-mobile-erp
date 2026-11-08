import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { Logo } from "@/components/logo";
import { getAuthContext } from "@/lib/auth";

export default async function ChangePasswordPage() {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  return (
    <main className="grid min-h-screen place-items-center bg-[#eef2f0] p-5">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-float sm:p-10">
        <Logo light />
        <div className="mt-10 flex items-center justify-between gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-700"><KeyRound className="h-5 w-5" /></div>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[.13em] text-blue-700">Final security step</span>
        </div>
        <h1 className="mt-5 text-2xl font-bold">One step before your dashboard</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{context.user.fullName}, replace the one-time password with your own permanent password. Your dashboard will open automatically when this is complete.</p>
        <ChangePasswordForm />
        <p className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-400"><ShieldCheck className="h-3.5 w-3.5" />The password change and session revocation are written to the audit trail.</p>
      </div>
    </main>
  );
}
