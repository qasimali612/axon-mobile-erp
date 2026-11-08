import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600"><ShieldX className="h-6 w-6" /></div>
        <h1 className="mt-5 text-2xl font-bold">Access not granted</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Your current company role or location scope does not allow this page. The server has blocked the request.</p>
        <Link href="/" className="mt-6 inline-block"><Button>Return to overview</Button></Link>
      </div>
    </main>
  );
}
