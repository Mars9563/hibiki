'use client';

import { useRef } from 'react';
import { ACCEPTED_FILE_TYPES } from '@/lib/attachments';
import { useAddStagedFiles } from '@/store/selectors';

// Encapsulates the hidden <input type="file"> plus its wiring to the
// composer store, so any button (ChatInput's "+", the preview's
// "add more") can trigger file selection without duplicating the
// accept list / validation plumbing. Render `input` once, call `open`
// on click.
export function useAttachmentPicker() {
  const addStagedFiles = useAddStagedFiles();
  const ref = useRef<HTMLInputElement>(null);

  const open = () => ref.current?.click();

  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      hidden
      accept={ACCEPTED_FILE_TYPES.join(',')}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = ''; // let the same file be re-picked later
        if (files.length) addStagedFiles(files);
      }}
    />
  );

  return { open, input };
}
