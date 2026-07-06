import { Loader2 } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="font-ui text-sm text-muted-foreground">
        Loading your chats...
      </p>
    </div>
  );
}
