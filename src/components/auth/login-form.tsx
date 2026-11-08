"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormError, responseError } from "@/components/ui/form-error";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().trim().email("Enter a valid work email."),
  password: z.string().min(8, "Enter your password."),
});
type Values = z.infer<typeof schema>;

const fieldClass = "h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-11 pr-4 text-sm text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,.8)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60";

export function LoginForm() {
  const [visible, setVisible] = useState(false);
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function submit(values: Values) {
    setServerError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        setServerError(await responseError(response));
        return;
      }
      const body = await response.json();
      const sessionCheck = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!sessionCheck.ok) {
        setServerError("Sign-in was verified, but this browser did not retain the secure session. Allow cookies for this site, then try again.");
        return;
      }
      // A document navigation avoids reusing an unauthenticated App Router cache entry.
      window.location.replace(body.data.forcePasswordChange ? "/change-password" : "/");
    } catch {
      setServerError("The sign-in service is temporarily unreachable. Check your connection and try again.");
    }
  }

  const emailField = register("email");
  const passwordField = register("password");

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
      {serverError ? (
        <div role="alert" aria-live="polite" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-medium leading-5 text-red-700 shadow-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      ) : null}

      <div>
        <label className="mb-2 block text-xs font-bold text-slate-700" htmlFor="email">Work email</label>
        <div className="relative">
          <Mail className={cn("pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2", errors.email ? "text-red-400" : "text-slate-400")} />
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={cn(fieldClass, errors.email && "border-red-300 focus:border-red-500 focus:ring-red-500/10")}
            placeholder="name@company.com"
            {...emailField}
          />
        </div>
        <div id="email-error"><FormError message={errors.email?.message} /></div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700" htmlFor="password">Password</label>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Case sensitive</span>
        </div>
        <div className="relative">
          <LockKeyhole className={cn("pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2", errors.password ? "text-red-400" : "text-slate-400")} />
          <input
            id="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            className={cn(fieldClass, "pr-12", errors.password && "border-red-300 focus:border-red-500 focus:ring-red-500/10")}
            placeholder="Enter your password"
            {...passwordField}
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            disabled={isSubmitting}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700 focus-visible:ring-blue-500"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div id="password-error"><FormError message={errors.password?.message} /></div>
      </div>

      <Button
        type="submit"
        size="lg"
        loading={isSubmitting}
        className="group h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-sm font-bold shadow-[0_12px_28px_rgba(37,99,235,.24)] transition hover:from-blue-800 hover:to-blue-700 hover:shadow-[0_14px_32px_rgba(37,99,235,.3)]"
      >
        {isSubmitting ? "Verifying access…" : "Sign in securely"}
        {!isSubmitting ? <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /> : null}
      </Button>

      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-[11px] font-medium text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
        Your access is scoped and recorded in the audit trail
      </div>
    </form>
  );
}
