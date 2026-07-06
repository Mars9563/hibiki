import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import '@/components/ui/pixelact-ui/styles/styles.css';

const pixelTextAreaVariants = cva(
  'pixel__textarea pixel-font rounded-none shadow-(--pixel-box-shadow) box-shadow-margin transition-colors',
  {
    variants: {
      variant: { default: 'bg-background text-foreground' },
      size: {
        default: 'px-3 py-2 text-sm',
        sm: 'px-2 py-1 text-xs',
        lg: 'px-4 py-3 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={1}
      data-slot="textarea"
      onInput={(e) => {
        const el = e.currentTarget;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 304) + 'px';
      }}
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none overflow-y-auto max-h-[304px]',
        pixelTextAreaVariants(),
        className
      )}
      {...props}
    />
  );
});
