export function PageHeader({ kicker, title, description, actions }: { kicker?: string; title: string; description: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {kicker ? <p className="kicker mb-2">{kicker}</p> : null}
        <h1 className="text-2xl font-bold text-slate-950 sm:text-[28px]">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
