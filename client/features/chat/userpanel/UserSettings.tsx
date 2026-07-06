'use client';

import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import z from 'zod';
import { toast } from 'sonner';
import { useChatStore } from '@/store/chatStore';
import { getCroppedImageBlob } from '@/lib/cropImage';
import { FaUserLarge } from 'react-icons/fa6';
import { useCurrentUser, useSetViewMode } from '@/store/selectors';
import { ArrowLeft } from 'lucide-react';
const profileSchema = z.object({
  name: z.string().trim().nonempty('Name is required').max(255),
  username: z
    .string()
    .trim()
    .regex(
      /^[_a-zA-Z][a-zA-Z0-9._]{2,19}$/,
      'Username must start with a letter or underscore and contain only letters, numbers, dots, or underscores (3–20 chars).'
    ),
  status: z
    .string()
    .trim()
    .max(150, 'Status length should be 150 letters or less'),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function UserSettings() {
  const user = useCurrentUser();
  // setCurrentUser has no dedicated selector hook yet (it's an
  // infrequent write, mirrors the pattern AppBootstrap.tsx already
  // uses) — pulled directly off the store rather than via selectors.ts.
  const setCurrentUser = useChatStore((s) => s.setCurrentUser);
  const setViewMode = useSetViewMode();

  // ---------- Avatar crop dialog state ----------
  // Cropping happens up front, in its own dialog, but nothing is
  // uploaded yet — the cropped Blob just sits in state until the
  // single Save button below submits everything together.
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  // Pending avatar — staged after cropping, applied on Save.
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.full_name ?? '',
      username: user?.username ?? '',
      status: user?.status ?? '',
    },
  });

  // Resync the form's baseline whenever the underlying user changes —
  // covers the case where this panel mounts before AppBootstrap has
  // finished populating currentUser, or the panel is reopened after
  // a value changed elsewhere. Without this, isDirty would compare
  // against a stale/empty baseline forever.
  useEffect(() => {
    if (!user) return;
    form.reset({
      name: user.full_name ?? '',
      username: user.username ?? '',
      status: user.status ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.full_name, user?.username, user?.status]);

  // Save is locked until something actually changed — either a text
  // field (react-hook-form's isDirty, compared against the values
  // last saved/loaded) or a newly staged avatar. Re-locks itself
  // after a successful save via form.reset() + clearing the pending
  // avatar below, rather than just leaving it enabled post-save.
  const hasChanges = form.formState.isDirty || pendingAvatarBlob !== null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be less than 5MB.');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPG, PNG, or WEBP allowed.');
      return;
    }

    setRawImageSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropDialogOpen(true);
    // Allow picking the same file again later.
    e.target.value = '';
  }

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // Confirming the crop only stages the result locally — it does not
  // touch the network. The actual upload happens once, in
  // onSubmit, alongside name/username.
  async function handleConfirmCrop() {
    if (!rawImageSrc || !croppedAreaPixels) return;

    try {
      setIsCropping(true);
      const blob = await getCroppedImageBlob(rawImageSrc, croppedAreaPixels);

      setPendingAvatarBlob(blob);
      setAvatarPreviewUrl(URL.createObjectURL(blob));
      setCropDialogOpen(false);
      setRawImageSrc(null);
    } catch {
      toast.error('Could not process that image.');
    } finally {
      setIsCropping(false);
    }
  }

  // Single combined save: name, username, and the staged avatar (if
  // any) all go in one multipart request, handled as one write on
  // the backend — see services/profile.service.ts. This is what
  // makes the signed-upload + overwrite-in-place avatar strategy
  // work cleanly, since there's only ever one save to reason about.
  async function onSubmit(values: ProfileFormValues) {
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('fullName', values.name);
      formData.append('username', values.username);
      formData.append('status', values.status);
      if (pendingAvatarBlob) {
        formData.append('avatar', pendingAvatarBlob, 'avatar.jpg');
      }

      const res = await fetch('/api/personal/me', {
        method: 'PATCH',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      setCurrentUser(data.profile);
      setPendingAvatarBlob(null);
      setAvatarPreviewUrl(null);
      // Re-baseline the form to the values just saved so isDirty goes
      // back to false and the Save button locks again until the next
      // actual edit.
      form.reset({ name: values.name, username: values.username });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  const displayedAvatarUrl = avatarPreviewUrl ?? user?.avatar_url ?? '';
  console.log(displayedAvatarUrl);
  return (
    <div className="h-full w-full font-chat">
      <div className="flex flex-row items-center gap-2 w-full h-17 p-4 border-b">
        <Button
          size="icon"
          variant="ghost"
          className="-ml-2 shrink-0 md:hidden"
          onClick={() => setViewMode('rooms')}
          aria-label="Back to chats"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <p className="text-2xl text-foreground font-semibold">
          Profile settings
        </p>
      </div>

      <div className="flex flex-col justify-center items-center p-6 gap-6">
        {/* Avatar — clicking opens the file picker, which opens the
            crop dialog. Nothing uploads until Save below. */}
        <label className="cursor-pointer group flex flex-col justify-center items-center">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          <Avatar
            size="lg"
            className="size-24 transition-opacity group-hover:opacity-80"
          >
            <AvatarImage src={displayedAvatarUrl} alt="Profile photo" />
            <AvatarFallback className="text-2xl">
              <FaUserLarge />
            </AvatarFallback>
          </Avatar>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {pendingAvatarBlob ? 'New photo selected' : 'Change photo'}
          </p>
        </label>

        {/* Name/username + Save — one form, one submit, one request. */}
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full max-w-sm"
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    {...field}
                    type="text"
                    placeholder="John Doe"
                    autoComplete="name"
                    className="bg-background"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="username"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Username</FieldLabel>
                  <Input
                    {...field}
                    type="text"
                    placeholder="Username"
                    autoComplete="username"
                    className="bg-background"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="status"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <Input
                    {...field}
                    type="text"
                    placeholder="Status(Optional)"
                    className="bg-background"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Button
              type="submit"
              disabled={isSaving || !hasChanges}
              className="mt-2"
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </FieldGroup>
        </form>
      </div>

      {/* Crop dialog — staging only, no network calls here */}
      <Dialog
        open={cropDialogOpen}
        onOpenChange={(open) => {
          if (!isCropping) setCropDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crop your photo</DialogTitle>
          </DialogHeader>

          {/* Square crop area; round overlay previews what will
              actually be visible once masked by the round avatar
              elsewhere in the app. The stored image stays square so
              it still looks right anywhere a square frame is used
              later. */}
          <div className="relative h-72 w-full overflow-hidden rounded-md bg-muted">
            {rawImageSrc && (
              <Cropper
                image={rawImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          <div className="flex items-center gap-3 px-1">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCropDialogOpen(false)}
              disabled={isCropping}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmCrop} disabled={isCropping}>
              {isCropping ? 'Processing...' : 'Use this photo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
