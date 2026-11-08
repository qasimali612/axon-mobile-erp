"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { responseError } from "@/components/ui/form-error";

export function ChangePasswordForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (values.newPassword !== values.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      toast.success("Password changed. Other sessions were signed out.");
      router.replace("/");
      router.refresh();
    } catch {
      setError("The password service is temporarily unreachable. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div><label className="label">Current password</label><input className="input h-11" type="password" autoComplete="current-password" value={values.currentPassword} onChange={(event) => setValues({ ...values, currentPassword: event.target.value })} required /></div>
      <div><label className="label">New password</label><input className="input h-11" type="password" autoComplete="new-password" value={values.newPassword} onChange={(event) => setValues({ ...values, newPassword: event.target.value })} required /></div>
      <div><label className="label">Confirm new password</label><input className="input h-11" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={(event) => setValues({ ...values, confirmPassword: event.target.value })} required /></div>
      <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">Use 12+ characters with uppercase, lowercase, a number, and a symbol. All other sessions are revoked after the change.</div>
      <Button type="submit" size="lg" loading={loading} className="w-full">Save password and open dashboard</Button>
    </form>
  );
}
