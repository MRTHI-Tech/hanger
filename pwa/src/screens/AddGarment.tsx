import {useEffect, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Banner} from '@astryxdesign/core/Banner';
import {Spinner} from '@astryxdesign/core/Spinner';
import {TextInput} from '@astryxdesign/core/TextInput';
import {api} from '@hanger/shared/api';
import {checkGarmentPhoto} from '@hanger/shared/imageChecks';
import {GarmentGuide} from '@hanger/shared/guides';
import {
  CATEGORY_LABELS,
  OWNABLE,
  type Garment,
  type TryOnCategory,
} from '@hanger/shared/types';
import {PhotoPick} from '../components/PhotoPick';
import {ErrorNote} from '../components/ErrorNote';

type Stage = 'photo' | 'checking' | 'details' | 'saving';

/** What to call it, per category, when the name is left empty. */
const PLACEHOLDERS: Record<TryOnCategory, string> = {
  upper_body: 'Black linen shirt',
  lower_body: 'Grey wool trousers',
  full_body: 'Navy summer dress',
  shoes: 'White trainers',
};

/**
 * Photograph something and hang it — the thing the phone is for.
 *
 * The panel has the same flow in `AddOwned`, and this is deliberately not a
 * port of it. The panel's version leads with "use my phone", because on a
 * laptop the garment is in another room; here the garment is in your hands and
 * the camera is the screen you're holding, so the handoff route disappears
 * entirely and the capture is one tap.
 *
 * It takes the whole screen rather than opening in a sheet. The sheet that got
 * you here is already at the foot of the screen, and a sheet raised over a
 * sheet is one of the few phone layouts that is properly broken rather than
 * merely ugly — and the details step wants the room once a keyboard is up.
 *
 * A name and a category are all this asks for, which is all
 * `POST /garments/owned` accepts: a piece photographed off a shop floor has no
 * product page for us to read a price off, and inventing fields for the person
 * to type is how you get a form nobody finishes.
 */
export function AddGarment({
  onHung,
  onCancel,
}: {
  onHung: (garment: Garment) => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState<Stage>('photo');
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<TryOnCategory | null>(null);
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  // The preview is an object URL over the chosen file; it has to be released or
  // every retry leaks the last photo.
  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function hang() {
    if (!photo || !category) return;
    setError(null);
    setStage('saving');
    try {
      onHung(
        await api.saveOwnedGarment(photo, {title: title.trim(), category}),
      );
    } catch (e) {
      setError(e);
      setStage('details');
    }
  }

  if (stage === 'checking') {
    return (
      <VStack padding={4} gap={4}>
        <Card>
          <HStack gap={3} vAlign="center">
            <Spinner />
            <Text>Checking your photo</Text>
          </HStack>
        </Card>
      </VStack>
    );
  }

  if (stage === 'details' || stage === 'saving') {
    const busy = stage === 'saving';
    return (
      <VStack padding={4} gap={4}>
        <VStack gap={1}>
          <Heading level={2}>What is it?</Heading>
          <Text type="supporting">
            This tells us where it goes in an outfit.
          </Text>
        </VStack>

        {previewUrl && (
          <div
            className="w-full overflow-hidden rounded-xl"
            style={{
              backgroundColor: 'var(--color-background-muted)',
              border: '1px solid var(--color-border)',
            }}>
            <img
              src={previewUrl}
              alt="The piece you're hanging"
              className="block w-full"
              // Capped in viewport units rather than pixels: this is the whole
              // screen on a phone, and the fields below it have to stay above
              // the fold on a small one.
              style={{maxHeight: '38vh', objectFit: 'contain'}}
            />
          </div>
        )}

        {error != null && (
          <ErrorNote
            error={error}
            title="We couldn't hang that"
            onAction={hang}
            actionLabel="Try again"
            onDismiss={() => setError(null)}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          {OWNABLE.map((option) => (
            <CategoryOption
              key={option}
              label={CATEGORY_LABELS[option]}
              isActive={category === option}
              isDisabled={busy}
              onClick={() => setCategory(option)}
            />
          ))}
        </div>

        <TextInput
          label="Name it"
          description="So you can tell it apart on the hanger."
          value={title}
          onChange={setTitle}
          isDisabled={busy}
          placeholder={category ? PLACEHOLDERS[category] : 'Black linen shirt'}
        />

        {busy ? (
          <Card>
            <HStack gap={3} vAlign="center">
              <Spinner />
              <Text>Hanging it</Text>
            </HStack>
          </Card>
        ) : (
          <VStack gap={2}>
            <Button
              label="Hang it"
              variant="primary"
              isDisabled={!category || title.trim().length === 0}
              onClick={hang}
            />
            <Button
              label="Use a different photo"
              variant="ghost"
              onClick={() => {
                setPhoto(null);
                setStage('photo');
              }}
            />
          </VStack>
        )}
      </VStack>
    );
  }

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Photograph it</Heading>
        <Text type="supporting">
          One piece, filling the frame. It hangs beside everything you've kept
          from a shop, and chains with it.
        </Text>
      </VStack>

      {problem && (
        <Banner
          status="warning"
          title="That photo won't work"
          description={problem}
          isDismissable
          onDismiss={() => setProblem(null)}
        />
      )}

      <Card variant="muted">
        <GarmentGuide />
      </Card>

      <PhotoPick
        facing="environment"
        cameraLabel="Take a photo"
        rollLabel="Choose from photos"
        check={checkGarmentPhoto}
        onStart={() => {
          setProblem(null);
          setError(null);
          setStage('checking');
        }}
        onProblem={(p) => {
          setProblem(p);
          setStage('photo');
        }}
        onPhoto={(chosen) => {
          setPhoto(chosen);
          setStage('details');
        }}
      />

      <Button label="Not now" variant="ghost" onClick={onCancel} />
    </VStack>
  );
}

function CategoryOption({
  label,
  isActive,
  isDisabled,
  onClick,
}: {
  label: string;
  isActive: boolean;
  isDisabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-pressed={isActive}
      className="w-full rounded-xl px-3"
      style={{
        border: `1px solid ${
          isActive ? 'var(--color-accent)' : 'var(--color-border)'
        }`,
        backgroundColor: isActive
          ? 'var(--color-accent-muted)'
          : 'transparent',
        color: 'var(--color-text-primary)',
        font: 'inherit',
        fontSize: 'var(--font-size-sm)',
        // A thumb target, not a mouse one: 44px is the floor on both platforms.
        minHeight: '2.75rem',
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
      }}>
      {label}
    </button>
  );
}
