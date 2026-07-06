export function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="flex-1 h-px bg-secondary" />
      <span className="font-chat text-[0.6rem] text-muted-foreground tracking-widest uppercase shrink-0">
        {date}
      </span>
      <div className="flex-1 h-px bg-secondary" />
    </div>
  );
}
