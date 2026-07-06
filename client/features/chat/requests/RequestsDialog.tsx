'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Search } from './Search';
import { PendingRequests } from './PendingRequests';

interface RequestsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestsDialog({ open, onOpenChange }: RequestsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="@container flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        {/* DialogTitle is required for a11y; visually hidden since each
            pane already carries its own heading, matching the wireframe
            which has no single top-level dialog title. */}
        <DialogTitle className="sr-only">Friend requests</DialogTitle>

        <div className="grid min-h-0 flex-1 grid-cols-1 @2xl:grid-cols-[1fr_1px_1fr]">
          <div className="min-h-0 min-w-0">
            <Search />
          </div>

          {/* Divider: horizontal line when stacked, vertical line when side-by-side */}
          <div className="h-px w-full bg-border @2xl:h-full @2xl:w-px" />

          <div className="min-h-0 min-w-0">
            <PendingRequests />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
