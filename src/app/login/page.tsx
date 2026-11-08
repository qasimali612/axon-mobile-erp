import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  Fingerprint,
  Headphones,
  Landmark,
  Lock,
  Phone,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Warehouse,
} from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/logo";
import { getAuthContext } from "@/lib/auth";

const controls = [
  { icon: Fingerprint, title: "Dual IMEI Tracking", detail: "Strict hardware-level custody" },
  { icon: Warehouse, title: "Multi-Warehouse Scopes", detail: "Branch & storekeeper isolation" },
  { icon: Landmark, title: "General Ledger Integrity", detail: "Self-balancing double-entry journals" },
];

export default async function LoginPage() {
  const context = await getAuthContext();
  if (context) redirect(context.user.forcePasswordChange ? "/change-password" : "/");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0c192e] p-0 lg:p-6 flex items-center justify-center">
      {/* Dynamic Background Mesh Gradients */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/30 via-[#071326] to-[#040b17]" />
      <div className="pointer-events-none absolute -left-48 -top-48 h-96 w-96 rounded-full bg-blue-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-48 h-96 w-96 rounded-full bg-indigo-500/10 blur-[120px]" />

      <div className="relative mx-auto grid w-full max-w-[1480px] overflow-hidden bg-white shadow-[0_35px_120px_rgba(0,0,0,.45)] lg:min-h-[820px] lg:grid-cols-[1.15fr_.85fr] lg:rounded-[32px] lg:border lg:border-white/10">
        
        {/* LEFT COLUMN: Premium Enterprise Showcase (Desktop) */}
        <section className="relative hidden min-h-[760px] overflow-hidden bg-[#07152f] text-white lg:flex lg:flex-col justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,.35),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(37,99,235,.2),transparent_35%),linear-gradient(150deg,#07152f_0%,#091e48_55%,#051226_100%)]" />
          
          {/* Subtle Architectural Grid */}
          <div
            className="absolute inset-0 opacity-[.14]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage: "linear-gradient(to bottom, black, transparent 88%)",
            }}
          />

          {/* Decorative Circles */}
          <div className="absolute -right-24 top-20 h-72 w-72 rounded-full border border-blue-400/15" />
          <div className="absolute -right-6 top-40 h-44 w-44 rounded-full border border-blue-400/15" />
          <div className="absolute bottom-[-140px] left-[-80px] h-[400px] w-[400px] rounded-full bg-blue-600/20 blur-3xl" />

          {/* Top Brand Bar */}
          <header className="relative z-10 flex items-center justify-between px-12 pt-10 xl:px-16">
            <Logo />
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[.08] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-blue-100 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)] animate-pulse" />
              Production Enterprise Portal
            </div>
          </header>

          {/* Main Visual & Value Proposition */}
          <div className="relative z-10 flex flex-col justify-center px-12 py-8 xl:px-16">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-3.5 py-1.5 text-xs font-semibold text-blue-200 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-blue-300" />
                Multi-Store Mobile Phone & Distribution ERP
              </div>
              <h1 className="max-w-[620px] font-display text-[46px] font-extrabold leading-[1.06] tracking-[-0.04em] xl:text-[56px]">
                Control every handset.
                <span className="mt-1 block bg-gradient-to-r from-blue-300 via-sky-200 to-white bg-clip-text text-transparent">
                  Trust every rupee.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-blue-100/70 xl:text-base">
                An integrated, server-authoritative workspace for IMEI tracking, point of sale counter checkout, wholesale distribution, and real-time financial ledger accounting.
              </p>
            </div>

            {/* Architecture Control Card */}
            <div className="mt-8 max-w-[640px] rounded-[24px] border border-white/10 bg-white/[.07] p-2 shadow-[0_25px_60px_rgba(0,0,0,.3)] backdrop-blur-xl">
              <div className="rounded-[18px] border border-white/[.08] bg-[#091b3f]/85 p-5 xl:p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-300/80">Compliance & Custody</p>
                    <p className="mt-1 text-sm font-bold text-white">Full Audit Trail from Procurement to POS</p>
                  </div>
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/20">
                    <ScanLine className="h-4 w-4" />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {controls.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-white/[.08] bg-white/[.04] p-3.5 transition hover:bg-white/[.07]">
                      <item.icon className="h-4 w-4 text-blue-300" />
                      <p className="mt-3 text-xs font-bold text-white">{item.title}</p>
                      <p className="mt-1 text-[10px] leading-4 text-blue-100/50">{item.detail}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[.08] px-4 py-2.5 text-[11px] text-emerald-100">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  Zero data loss architecture · Dual IMEI validation · Immutable General Ledger
                </div>
              </div>
            </div>
          </div>

          {/* Left Footer with Developer & Support Info */}
          <footer className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-12 pb-9 text-xs font-medium text-blue-100/55 xl:px-16 border-t border-white/10 pt-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-400" />
              <span>Axon Mobile ERP Enterprise v2.4</span>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-200">
                © 2026 Copyright Reserved · <span className="text-white font-bold">Qasim Ali</span>
              </p>
              <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] text-blue-300 font-mono">
                <Phone className="h-3 w-3" />
                <a href="tel:03155049489" className="hover:underline text-blue-200">0315-5049489</a>
              </div>
            </div>
          </footer>
        </section>

        {/* RIGHT COLUMN: Sign In Form (Clean, Modern & Accessible) */}
        <section className="relative flex min-h-screen flex-col justify-between px-6 py-10 sm:px-12 lg:min-h-0 lg:px-14 xl:px-20 bg-white">
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-50/70 to-transparent lg:hidden pointer-events-none" />
          
          {/* Mobile Top Brand Bar */}
          <div className="relative z-10 flex items-center justify-between lg:hidden pb-6 border-b border-slate-100">
            <Logo light />
            <div className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">
              <ShieldCheck className="h-3 w-3" /> Enterprise
            </div>
          </div>

          <div className="relative my-auto w-full max-w-[420px] mx-auto py-8">
            <div className="mb-8">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700 shadow-[0_8px_24px_rgba(37,99,235,.12)]">
                <Boxes className="h-6 w-6" />
              </div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">Authorized Access</p>
              <h2 className="mt-2 font-display text-[32px] font-extrabold leading-tight tracking-[-0.03em] text-slate-950 sm:text-[36px]">
                Welcome Back
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Sign in with your organization credentials to access sales, stock, and finance operations.
              </p>
            </div>

            <LoginForm />

            <div className="mt-8 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-center gap-2 text-center text-[11px] font-medium text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Protected by 256-bit encrypted HTTP-only session tokens
              </div>
            </div>
          </div>

          {/* Form Bottom Footer: Prominent Professional Copyright & Support Notice */}
          <footer className="mt-6 border-t border-slate-100 pt-5 text-center space-y-1.5">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-600">
              <span>© 2026 Copyright Reserved</span>
              <span className="text-slate-300">·</span>
              <span className="font-bold text-slate-900">Qasim Ali</span>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs font-medium text-blue-700">
              <Phone className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              <a href="tel:03155049489" className="hover:underline font-mono font-bold tracking-tight">
                0315-5049489
              </a>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500 text-[11px] font-normal">Technical Inquiries & Licensing</span>
            </div>
          </footer>

        </section>
      </div>
    </main>
  );
}
