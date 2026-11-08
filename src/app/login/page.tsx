import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  Fingerprint,
  Landmark,
  ScanLine,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/logo";
import { getAuthContext } from "@/lib/auth";

const controls = [
  { icon: Fingerprint, title: "Device identity", detail: "IMEI and serial custody" },
  { icon: Warehouse, title: "Stock control", detail: "Branch and warehouse scope" },
  { icon: Landmark, title: "Financial integrity", detail: "Balanced, traceable posting" },
];

export default async function LoginPage() {
  const context = await getAuthContext();
  if (context) redirect(context.user.forcePasswordChange ? "/change-password" : "/");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f7fb] p-0 lg:p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(59,130,246,.11),transparent_30%),radial-gradient(circle_at_88%_88%,rgba(37,99,235,.08),transparent_28%)]" />

      <div className="relative mx-auto grid min-h-screen max-w-[1500px] overflow-hidden bg-white shadow-[0_30px_100px_rgba(15,23,42,.14)] lg:min-h-[calc(100vh-40px)] lg:grid-cols-[1.12fr_.88fr] lg:rounded-[30px] lg:border lg:border-white/80">
        <section className="relative hidden min-h-[720px] overflow-hidden bg-[#07152f] text-white lg:flex lg:flex-col">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(59,130,246,.38),transparent_31%),radial-gradient(circle_at_82%_78%,rgba(29,78,216,.25),transparent_34%),linear-gradient(145deg,#07152f_0%,#0a2252_52%,#071735_100%)]" />
          <div
            className="absolute inset-0 opacity-[.16]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
              backgroundSize: "52px 52px",
              maskImage: "linear-gradient(to bottom, black, transparent 82%)",
            }}
          />
          <div className="absolute -right-28 top-24 h-72 w-72 rounded-full border border-blue-300/15" />
          <div className="absolute -right-8 top-44 h-44 w-44 rounded-full border border-blue-300/15" />
          <div className="absolute bottom-[-150px] left-[-100px] h-[430px] w-[430px] rounded-full bg-blue-600/20 blur-3xl" />

          <header className="relative z-10 flex items-center justify-between px-12 pt-11 xl:px-16">
            <Logo />
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-blue-100 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.12)]" />
              Secure operations portal
            </div>
          </header>

          <div className="relative z-10 flex flex-1 flex-col justify-center px-12 py-12 xl:px-16">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-300/15 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
                <BadgeCheck className="h-3.5 w-3.5" />
                Purpose-built for mobile distribution
              </div>
              <h1 className="max-w-[650px] font-display text-[48px] font-extrabold leading-[1.04] tracking-[-0.05em] xl:text-[60px]">
                Control every device.
                <span className="mt-1 block bg-gradient-to-r from-blue-300 via-sky-200 to-white bg-clip-text text-transparent">Trust every number.</span>
              </h1>
              <p className="mt-6 max-w-xl text-[15px] leading-7 text-blue-100/65 xl:text-base">
                One governed workspace for purchasing, IMEI custody, inventory, point of sale, returns, and the general ledger.
              </p>
            </div>

            <div className="mt-10 max-w-[650px] rounded-[24px] border border-white/10 bg-white/[.075] p-2 shadow-[0_25px_70px_rgba(0,0,0,.22)] backdrop-blur-xl">
              <div className="rounded-[18px] border border-white/[.07] bg-[#0b1d42]/80 p-5 xl:p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-300/70">Control architecture</p>
                    <p className="mt-1 text-sm font-semibold text-white">Document to ledger, without broken custody</p>
                  </div>
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/15 text-blue-300"><ScanLine className="h-4 w-4" /></div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {controls.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-white/[.08] bg-white/[.045] p-4">
                      <item.icon className="h-4 w-4 text-blue-300" />
                      <p className="mt-4 text-xs font-bold text-white">{item.title}</p>
                      <p className="mt-1 text-[10px] leading-4 text-blue-100/50">{item.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-300/10 bg-emerald-300/[.06] px-4 py-3 text-[11px] text-emerald-100/75">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  Server-authoritative workflows keep stock, serialized units, and accounting in one atomic trail.
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-300/60" />
                </div>
              </div>
            </div>
          </div>

          <footer className="relative z-10 flex items-center justify-between px-12 pb-10 text-[10px] font-medium uppercase tracking-[.13em] text-blue-100/35 xl:px-16">
            <span>Axon Mobile ERP</span>
            <span>Access governed · Activity audited</span>
          </footer>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-5 py-8 sm:px-10 lg:min-h-0 lg:px-14 xl:px-20">
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-50/80 to-transparent lg:hidden" />
          <div className="relative w-full max-w-[440px] animate-slide-up">
            <div className="mb-12 flex items-center justify-between lg:hidden">
              <Logo light />
              <div className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 shadow-sm">
                <ShieldCheck className="h-3 w-3" /> Secure
              </div>
            </div>

            <div className="mb-8">
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700 shadow-[0_10px_30px_rgba(37,99,235,.12)]">
                <Boxes className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-blue-700">Authorized workspace</p>
              <h2 className="mt-3 font-display text-[34px] font-extrabold leading-tight tracking-[-0.04em] text-slate-950 sm:text-[38px]">Welcome back</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">Sign in with your organization account to continue to operations.</p>
            </div>

            <LoginForm />

            <div className="mt-9 border-t border-slate-100 pt-6">
              <div className="flex items-center justify-center gap-2 text-center text-[11px] leading-5 text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                Protected by HttpOnly sessions and server-enforced access control
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
