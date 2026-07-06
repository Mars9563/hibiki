'use client';
import { Field, FieldGroup } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, SendIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import z from 'zod';
import {
  useSelectedRoom,
  useSendMessage,
  useSendAttachmentMessage,
  useIsUploadingAttachment,
  useStagedFiles,
  useClearStagedFiles,
} from '@/store/selectors';
import { useAttachmentPicker } from './useAttachmentPicker';

const formSchema = z.object({
  // .nonempty() dropped — a caption is optional once files are staged.
  message: z.string().trim(),
});

// Warns on tab close/refresh only while an attachment is actively
// uploading — that's the one moment leaving early actually loses
// something. Note: modern browsers ignore the custom returnValue
// text and show their own generic dialog instead — that's expected,
// not a bug in this implementation.
function useBeforeUnloadWarning(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue =
        'A file is still uploading. Leaving now may result in data loss or an incomplete upload.';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isActive]);
}

export function ChatInput() {
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const selectedRoom = useSelectedRoom();
  const sendMessage = useSendMessage();
  const sendAttachmentMessage = useSendAttachmentMessage();
  const isUploadingAttachment = useIsUploadingAttachment();

  // Staged files live in the store so ChatArea can swap the message
  // list for a full-screen preview while this bar stays put as the
  // caption box (see AttachmentPreview / ChatArea).
  const stagedFiles = useStagedFiles();
  const clearStagedFiles = useClearStagedFiles();
  const { open: openFilePicker, input: fileInput } = useAttachmentPicker();

  useBeforeUnloadWarning(isUploadingAttachment);

  const hasStaged = stagedFiles.length > 0;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { message: '' },
  });

  function onMessageSubmit(data: z.infer<typeof formSchema>) {
    if (!selectedRoom) return;
    if (stagedFiles.length === 0 && !data.message.trim()) return;

    setIsLoading(true);

    if (stagedFiles.length > 0) {
      // Fire-and-forget, same as sendMessage below — the action owns
      // its own optimistic entry, error toast, and status rollback.
      // Clearing the staged list here is safe: the send captured the
      // File array synchronously before we reset it.
      sendAttachmentMessage(selectedRoom, stagedFiles, data.message);
      clearStagedFiles();
    } else {
      sendMessage(data.message, selectedRoom);
    }

    // The Textarea auto-sizes via CSS field-sizing, so clearing the
    // value here shrinks it back to one row on its own.
    form.reset();

    setIsLoading(false);
  }

  return (
    <div className="flex w-full flex-col bg-card">
      <div className="flex w-full flex-1 flex-row items-center justify-center gap-3 p-3">
        {fileInput}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={!selectedRoom}
          onClick={openFilePicker}
          aria-label="Attach files"
        >
          <Plus />
        </Button>

        <form
          onSubmit={form.handleSubmit(onMessageSubmit)}
          id="message_submit_form"
          className="w-full"
        >
          <FieldGroup>
            <Controller
              name="message"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <Textarea
                    {...field}
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        form.handleSubmit(onMessageSubmit)();
                      }
                    }}
                    placeholder={
                      hasStaged ? 'Add a caption...' : 'Enter your message...'
                    }
                    autoComplete="off"
                    className="max-h-150"
                  />
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <Button
          type="submit"
          form="message_submit_form"
          disabled={isLoading || !selectedRoom}
          variant="secondary"
          aria-label={hasStaged ? 'Send attachments' : 'Send message'}
        >
          <SendIcon />
        </Button>
      </div>
    </div>
  );
}
