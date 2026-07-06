// ============================================================
// store/slices/createComposerSlice.ts
// Ephemeral "message being composed" state — the files a user has
// staged but not yet sent. Lives in the store (not local component
// state) so ChatArea can swap the message list for a full-screen
// attachment preview while ChatInput keeps owning the caption + send.
//
// Cleared on room switch (see createUiSlice.selectRoom) and after a
// send (see ChatInput). File objects are non-draftable, so immer
// stores them by reference without freezing them.
// ============================================================
import type { StateCreator } from 'zustand';
import { toast } from 'sonner';
import type { ChatStore } from '../chatStore';
import {
  MAX_FILES_PER_MESSAGE,
  MAX_TOTAL_PAYLOAD_SIZE,
  formatFileSize,
} from '@/lib/attachments';

export type ComposerSlice = {
  stagedFiles: File[];

  addStagedFiles: (files: File[]) => void;
  removeStagedFile: (index: number) => void;
  clearStagedFiles: () => void;
};

export const createComposerSlice: StateCreator<
  ChatStore,
  [['zustand/immer', never]],
  [],
  ComposerSlice
> = (set, get) => ({
  stagedFiles: [],

  addStagedFiles: (incoming) => {
    if (incoming.length === 0) return;

    const current = get().stagedFiles;
    let count = current.length;
    let total = current.reduce((sum, f) => sum + f.size, 0);

    // Accept in order and stop at the first file that would breach the
    // count or total-payload cap — everything after it is dropped ("the
    // end ones"), keeping the request under the proxy/R2 body limit.
    const accepted: File[] = [];
    let reason: 'count' | 'size' | null = null;

    for (const file of incoming) {
      if (count >= MAX_FILES_PER_MESSAGE) {
        reason = 'count';
        break;
      }
      if (total + file.size > MAX_TOTAL_PAYLOAD_SIZE) {
        reason = 'size';
        break;
      }
      accepted.push(file);
      count += 1;
      total += file.size;
    }

    if (accepted.length > 0) {
      set((state) => {
        state.stagedFiles = [...state.stagedFiles, ...accepted];
      });
    }

    const dropped = incoming.length - accepted.length;
    if (dropped > 0) {
      toast.error(
        reason === 'count'
          ? `You can attach up to ${MAX_FILES_PER_MESSAGE} files — ${dropped} skipped.`
          : `Attachments must total under ${formatFileSize(
              MAX_TOTAL_PAYLOAD_SIZE
            )} — ${dropped} skipped.`
      );
    }
  },

  removeStagedFile: (index) =>
    set((state) => {
      state.stagedFiles = state.stagedFiles.filter((_, i) => i !== index);
    }),

  clearStagedFiles: () =>
    set((state) => {
      if (state.stagedFiles.length > 0) state.stagedFiles = [];
    }),
});
