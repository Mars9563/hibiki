'use client';

import {
  MediaController,
  MediaControlBar,
  MediaPlayButton,
  MediaTimeRange,
  MediaTimeDisplay,
  MediaMuteButton,
} from 'media-chrome/react';
import { cn } from '@/lib/utils';
import type { AttachmentGroupProps } from './types';

export function AudioContent({ attachments, isPending }: AttachmentGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      {attachments.map((audio) => (
        <MediaController
          key={audio.id}
          audio
          className={cn(
            'flex w-full items-center overflow-hidden rounded-2xl bg-black/10',
            '[--media-primary-color:currentColor]',
            '[--media-secondary-color:transparent]',
            '[--media-control-background:transparent]',
            '[--media-control-hover-background:rgba(128,128,128,0.2)]',
            '[--media-range-bar-color:var(--primary)]',
            '[--media-control-height:40px]',
            '[--media-font-size:13px]',
            isPending && 'pointer-events-none opacity-60'
          )}
        >
          <audio slot="media" src={audio.url} preload="metadata" />
          <MediaControlBar className='p-2 flex flex-row items-center justify-center gap-2'>
            <MediaPlayButton />
            <MediaTimeRange />
            <MediaTimeDisplay showDuration />
            <MediaMuteButton />
          </MediaControlBar>
        </MediaController>
      ))}
    </div>
  );
}
