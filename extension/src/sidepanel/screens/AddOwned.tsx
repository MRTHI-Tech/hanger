import {useCallback, useEffect, useRef, useState} from 'react';
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
import {checkGarmentPhoto} from '../imageChecks';
import {GarmentGuide} from '../components/GarmentGuide';
import {CameraCapture} from '../components/CameraCapture';
import {PhoneHandoff} from '../components/PhoneHandoff';
import {ErrorNote} from '../components/ErrorNote';
import {
  CATEGORY_LABELS,
  OWNABLE,
  type Garment,
  type TryOnCategory,
} from '@hanger/shared/types';

type Stage = 'photo' | 'camera' | 'phone' | 'checking' | 'details' | 'saving';

/** What to call it, per category, when the name is left empty. */
const PLACEHOLDERS: Record<TryOnCategory, string> = {
  upper_body: 'Black linen shirt',
  lower_body: 'Grey wool trousers',
  full_body: 'Navy summer dress',
  shoes: 'White trainers',
};

/**
 * Hang something out of your own wardrobe. The half of an outfit that isn't
 * for sale: photograph what you own, and it sits in Your Hanger next to the
 * things you're still deciding about, chainable with them.
 *
 * No retailer, no price, no product page — so the name is the only thing that
 * identifies it later, in the buy list and the slot picker. That's why it's
 * asked for rather than defaulted.
 */
export function AddOwned({
  onHung,
  onCancel,
}: {
  onHung: (garment: Garment) => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState<Stage>('photo');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<TryOnCategory | null>(null);
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The preview is an object URL over the chosen file; it has to be released
  // or every retry leaks the last photo.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const cameraUnavailable = useCallback((reason: string) => {
    setProblem(reason);
    setStage('photo');
  }, []);

  // Stable: PhoneHandoff polls in an effect keyed on this, and a new function
  // every render would restart the poll every render.
  const accept = useCallback(async (candidate: File) => {
    setProblem(null);
    setError(null);
    setStage('checking');

    const check = await checkGarmentPhoto(candidate);
    if (!check.ok) {
      setProblem(check.problem ?? "That photo won't work.");
      setStage('photo');
      return;
    }

    setFile(candidate);
    setStage('details');
  }, []);

  async function hang() {
    if (!file || !category) return;
    setError(null);
    setStage('saving');
    try {
      const garment = await api.saveOwnedGarment(file, {
        title: title.trim(),
        category,
      });
      onHung(garment);
    } catch (e) {
      setError(e);
      setStage('details');
    }
  }

  if (stage === 'camera') {
    return (
      <CameraCapture
        title="Fill the frame"
        hint="One piece, laid flat or on a hanger, on a plain background."
        facing="environment"
        captureLabel="Take the photo"
        filename="owned.jpg"
        onCapture={accept}
        onCancel={() => setStage('photo')}
        onUnavailable={cameraUnavailable}
      />
    );
  }

  if (stage === 'phone') {
    return (
      <PhoneHandoff
        purpose="garment"
        title="Use your phone"
        hint="The piece is in your wardrobe, not on your laptop. Photograph it where it is."
        onPhoto={accept}
        onCancel={() => setStage('photo')}
      />
    );
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
      <VStack padding={4} gap={4} isScrollable>
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
              style={{maxHeight: 300, objectFit: 'contain'}}
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
                setFile(null);
                setStage('photo');
              }}
            />
          </VStack>
        )}
      </VStack>
    );
  }

  return (
    <VStack padding={4} gap={4} isScrollable>
      <VStack gap={1}>
        <Heading level={2}>Something you already own</Heading>
        <Text type="supporting">
          Photograph a piece from your own wardrobe and it hangs beside the
          things you're still deciding about.
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

      <VStack gap={2}>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            e.target.value = '';
            if (chosen) void accept(chosen);
          }}
        />
        {/* The piece is hanging in a wardrobe in another room, so the phone is
            the likeliest camera — it leads. The laptop's own camera is kept
            for anyone holding the garment up to the screen. */}
        <Button
          label="Use my phone"
          variant="primary"
          onClick={() => setStage('phone')}
        />
        <Button
          label="Choose a photo"
          variant="secondary"
          onClick={() => fileInput.current?.click()}
        />
        <Button
          label="Take one now"
          variant="secondary"
          onClick={() => setStage('camera')}
        />
        <Button label="Not now" variant="ghost" onClick={onCancel} />
      </VStack>
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
      className="w-full rounded-xl px-3 py-3"
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
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
      }}>
      {label}
    </button>
  );
}
