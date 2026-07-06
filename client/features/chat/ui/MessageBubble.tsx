'use client';

import { format } from 'date-fns';
import { Clock, Check, CheckCheck, Copy, ChevronDown } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ATTACHMENT_RENDERERS } from '../messages';
import type { Attachment, MessageType } from '@/lib/types';

const TRUNCATE_LIMIT = 300;

interface MessageBubbleProps {
  content: string | null;
  attachments: Attachment[];
  messageType: MessageType;
  senderId: string;
  currentUserId: string;
  avatarUrl?: string | null;
  fallback?: ReactNode;
  status?: 'pending' | 'sent' | 'received' | 'failed';
  createdAt?: Date | string;
}

export function MessageBubble({
  content,
  attachments,
  messageType,
  senderId,
  currentUserId,
  avatarUrl,
  fallback,
  status,
  createdAt,
}: MessageBubbleProps) {
  const isMine = senderId === currentUserId;
  const isPending = status === 'pending';
  const hasAttachments = attachments.length > 0;

  const [isExpanded, setIsExpanded] = useState(false);

  const formattedTime = createdAt
    ? format(new Date(createdAt), 'hh:mm a')
    : null;

  const isLong = (content?.length ?? 0) > TRUNCATE_LIMIT;

  const displayedContent =
    content && isLong && !isExpanded
      ? content.slice(0, TRUNCATE_LIMIT).trimEnd()
      : content;

  async function handleCopy() {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copied message');
    } catch {
      toast.error('Failed to copy');
    }
  }

  // 'text' maps to null in the registry, so this is naturally null for
  // caption-only messages — no attachments.length check needed here.
  const AttachmentContent = ATTACHMENT_RENDERERS[messageType];

  return (
    <div
      className={cn(
        'group flex w-full gap-3 py-1.5',
        isMine ? 'justify-end' : 'justify-start'
      )}
    >
      {!isMine && (
        <Avatar size="lg" className="mt-auto shrink-0">
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback className="bg-accent text-accent-foreground font-medium">
            {fallback ?? '??'}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          'relative',
          'w-auto',
          'min-w-30',
          'max-w-[85%]',
          'sm:max-w-[80%]',
          'md:max-w-[75%]',
          'lg:max-w-[65%]',
          'xl:max-w-175',
          'flex flex-col',
          'gap-2',
          'rounded-3xl',
          hasAttachments ? 'p-2' : 'px-4 py-3',
          'transition-all duration-200',
          isMine
            ? [
                'bg-mine',
                'text-primary-foreground',
                'rounded-br-lg',
                'shadow-lg shadow-primary/15',
              ]
            : [
                'bg-card',
                'text-card-foreground',
                'border border-border',
                'rounded-bl-lg',
              ]
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'absolute right-3 top-3 z-10',
                'opacity-0',
                'group-hover:opacity-100',
                'transition-opacity duration-200',
                isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
              )}
            >
              <ChevronDown className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-fit p-2">
            {content && (
              <DropdownMenuItem
                onClick={handleCopy}
                className="flex flex-row items-center gap-2"
              >
                <Copy className="size-4" />
                <span>Copy Message</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {AttachmentContent && (
          <AttachmentContent attachments={attachments} isPending={isPending} />
        )}

        {content && (
          <p
            className={cn(
              'whitespace-pre-wrap wrap-anywhere text-[15px] leading-6',
              hasAttachments ? 'px-2 pt-1' : 'pr-5'
            )}
          >
            {displayedContent}
            {isLong && !isExpanded && <span className="opacity-50">…</span>}
          </p>
        )}

        {isLong && (
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className={cn(
              'w-fit',
              hasAttachments && 'px-2',
              'text-xs font-medium',
              'transition-opacity',
              'hover:opacity-80',
              isMine ? 'text-primary-foreground/80' : 'text-muted-foreground'
            )}
          >
            {isExpanded ? 'Show less' : 'Read more'}
          </button>
        )}

        <div
          className={cn(
            'flex items-center justify-end gap-1.5',
            'text-[11px]',
            hasAttachments && 'px-2 pb-1',
            isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {isMine && status === 'failed' && (
            <span className="mr-1 text-destructive">Failed to send</span>
          )}
          {formattedTime && <span>{formattedTime}</span>}
          {isMine && status === 'pending' && <Clock className="size-3" />}
          {isMine && status === 'sent' && <Check className="size-3" />}
          {isMine && status === 'received' && <CheckCheck className="size-3" />}
        </div>
      </div>
    </div>
  );
}
