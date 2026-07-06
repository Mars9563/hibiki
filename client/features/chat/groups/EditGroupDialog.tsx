'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, UsersRound } from 'lucide-react';
import Cropper, { type Area } from 'react-easy-crop';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getCroppedImageBlob } from '@/lib/cropImage';
import { useUpdateGroup, useUpdatingGroup } from '@/store/selectors';

interface EditGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  currentName: string;
  currentDescription: string | null;
  currentAvatarUrl: string | null;
}

export function EditGroupDialog({
  open,
  onOpenChange,
  roomId,
  currentName,
  currentDescription,
  currentAvatarUrl,
}: EditGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
        </DialogHeader>
        {/* Radix mounts DialogContent's children only while open, so the
            form below re-initializes from the latest values every time
            the dialog opens — no prop→state syncing effect needed. */}
        {open && (
          <EditGroupForm
            roomId={roomId}
            initialName={currentName}
            initialDescription={currentDescription ?? ''}
            initialAvatarUrl={currentAvatarUrl}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditGroupForm({
  roomId,
  initialName,
  initialDescription,
  initialAvatarUrl,
  onDone,
}: {
  roomId: string;
  initialName: string;
  initialDescription: string;
  initialAvatarUrl: string | null;
  onDone: () => void;
}) {
  const updateGroup = useUpdateGroup();
  const updating = useUpdatingGroup();

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  // Avatar cropping happens inline (mode switch) rather than in a
  // nested dialog — the cropped Blob is staged locally and only
  // uploaded when Save runs, alongside name/description.
  const [mode, setMode] = useState<'form' | 'crop'>('form');
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  // Revoke blob URLs when they're replaced or the form unmounts.
  useEffect(() => {
    if (!rawImageSrc) return;
    return () => URL.revokeObjectURL(rawImageSrc);
  }, [rawImageSrc]);
  useEffect(() => {
    if (!avatarPreviewUrl) return;
    return () => URL.revokeObjectURL(avatarPreviewUrl);
  }, [avatarPreviewUrl]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB.');
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
    setMode('crop');
  }

  async function handleConfirmCrop() {
    if (!rawImageSrc || !croppedAreaPixels) return;
    try {
      setIsCropping(true);
      const blob = await getCroppedImageBlob(rawImageSrc, croppedAreaPixels);
      setPendingAvatarBlob(blob);
      setAvatarPreviewUrl(URL.createObjectURL(blob));
      setRawImageSrc(null); // effect above revokes it
      setMode('form');
    } catch {
      toast.error('Could not process that image.');
    } finally {
      setIsCropping(false);
    }
  }

  function handleCancelCrop() {
    setRawImageSrc(null);
    setMode('form');
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Group name is required');
      return;
    }

    try {
      await updateGroup(roomId, {
        name: trimmedName,
        description: description.trim(),
        avatar: pendingAvatarBlob ?? undefined,
      });
      toast.success('Group updated');
      onDone();
    } catch (err) {
      toast.error('Failed to update group', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  if (mode === 'crop') {
    return (
      <>
        {/* Square crop with a round overlay — the stored image stays
            square so it looks right in any frame. */}
        <div className="relative h-64 w-full overflow-hidden rounded-md bg-muted">
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
            onClick={handleCancelCrop}
            disabled={isCropping}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirmCrop} disabled={isCropping}>
            {isCropping ? 'Processing...' : 'Use photo'}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const displayedAvatar = avatarPreviewUrl ?? initialAvatarUrl ?? undefined;

  return (
    <>
      <div className="flex flex-col items-center py-1">
        <label className="group flex cursor-pointer flex-col items-center">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          <Avatar className="size-20 border transition-opacity group-hover:opacity-80">
            <AvatarImage src={displayedAvatar} />
            <AvatarFallback>
              <UsersRound className="size-8" />
            </AvatarFallback>
          </Avatar>
          <span className="mt-1.5 text-xs text-muted-foreground">
            {pendingAvatarBlob ? 'New photo selected' : 'Change photo'}
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this group about?"
            rows={3}
            className="max-h-40"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={updating}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={updating}>
          {updating ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
        </Button>
      </DialogFooter>
    </>
  );
}
