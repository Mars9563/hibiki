'use client';

import {
  MediaController,
  MediaControlBar,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeRange,
  MediaTimeDisplay,
  MediaMuteButton,
  MediaFullscreenButton,
} from 'media-chrome/react';
import { cn } from '@/lib/utils';
import type { AttachmentGroupProps } from './types';

export function VideoContent({ attachments, isPending }: AttachmentGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      {attachments.map((video) => (
        <MediaController
          key={video.id}
          className={cn(
            'block max-h-80 w-full overflow-hidden rounded-2xl bg-black/60',
            '[--media-primary-color:white]',
            '[--media-secondary-color:transparent]',
            '[--media-control-background:transparent]',
            '[--media-control-hover-background:rgba(255,255,255,0.15)]',
            '[--media-range-bar-color:var(--primary)]',
            '[--media-control-height:36px]',
            '[--media-font-size:13px]',
            isPending && 'pointer-events-none opacity-60'
          )}
        >
          <video
            slot="media"
            src={video.url}
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
          <MediaControlBar>
            <MediaPlayButton />
            <MediaSeekBackwardButton seekOffset={10} />
            <MediaSeekForwardButton seekOffset={10} />
            <MediaTimeRange />
            <MediaTimeDisplay showDuration />
            <MediaMuteButton />
            <MediaFullscreenButton />
          </MediaControlBar>
        </MediaController>
      ))}
    </div>
  );
}
