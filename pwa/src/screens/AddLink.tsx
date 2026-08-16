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
import {formatPrice} from '@hanger/shared/format';
import {
  CATEGORY_LABELS,
  type Garment,
  type GarmentCategory,
  type LinkPreview,
} from '@hanger/shared/types';
import {CategoryPick} from '../components/CategoryPick';
import {ErrorNote} from '../components/ErrorNote';

/** A shop link can be any of these — unlike a piece you photograph. */
const LINKABLE: GarmentCategory[] = [
  'upper_body',
  'lower_body',
  'full_body',
  'shoes',
  'bag',
  'hat',
  'scarf',
];

type Stage = 'paste' | 'reading' | 'confirm' | 'saving';

/**
 * A link becomes a garment.
 *
 * The route in that has no laptop in it. Somebody sends you a shop link in
 * WhatsApp, or you find one in Instagram — on a desktop that is the extension's
 * whole job, and on a phone there was nothing at all until now. Shared in from
 * another app, or pasted here by hand; both land on this screen.
 *
 * **Read, then confirm, then hang.** Not one tap, and the extra one is §9.4's
 * rule rather than caution: the category is inferred from words in a title, and
 * it decides which half of you a try-on gets fitted to. A wrong guess applied
 * silently is a wasted unit and a picture of a jacket on your legs. So the
 * server reads the page, the screen shows what it found, and nothing is kept
 * until somebody has looked at it.
 */
export function AddLink({
  initialUrl = '',
  onHung,
  onPhotograph,
  onCancel,
}: {
  /** Prefilled when the link was shared in rather than typed. */
  initialUrl?: string;
  onHung: (garment: Garment) => void;
  /** The way out when a page has no picture we can use — §13, never a dead end. */
  onPhotograph: () => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [stage, setStage] = useState<Stage>(initialUrl ? 'reading' : 'paste');
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<GarmentCategory>('upper_body');
  const [error, setError] = useState<unknown>(null);

  const read = useCallback(async (link: string) => {
    setError(null);
    setStage('reading');
    try {
      const found = await api.readLink(link.trim());
      setPreview(found);
      setTitle(found.title);
      setCategory(found.category);
      setStage('confirm');
    } catch (e) {
      setError(e);
      setStage('paste');
    }
  }, []);

  // A shared link reads itself on arrival — the sharing was the instruction.
  // Guarded for the same reason every other kick-off on this app is: StrictMode
  // runs effects twice, and this one fetches somebody's page.
  const hasRead = useRef(false);
  useEffect(() => {
    if (!initialUrl || hasRead.current) return;
    hasRead.current = true;
    void read(initialUrl);
  }, [initialUrl, read]);

  async function hang() {
    if (!preview?.imageUrl) return;
    setError(null);
    setStage('saving');
    try {
      onHung(
        await api.hangLink({
          ...preview,
          imageUrl: preview.imageUrl,
          title: title.trim() || preview.title,
          category,
        }),
      );
    } catch (e) {
      setError(e);
      setStage('confirm');
    }
  }

  if (stage === 'reading') {
    return (
      <VStack padding={4} gap={4}>
        <VStack gap={1}>
          <Heading level={2}>Reading the page</Heading>
          <Text type="supporting">{hostOf(url)}</Text>
        </VStack>
        <Card>
          <HStack gap={3} vAlign="center">
            <Spinner />
            <Text>Looking for what it is and what it costs</Text>
          </HStack>
        </Card>
      </VStack>
    );
  }

  if (stage === 'confirm' || stage === 'saving') {
    if (!preview) return null;
    const busy = stage === 'saving';

    return (
      <VStack padding={4} gap={4}>
        <VStack gap={1}>
          <Heading level={2}>Is this it?</Heading>
          <Text type="supporting">
            Read off {preview.retailer}. Change anything that isn't right.
          </Text>
        </VStack>

        {preview.imageUrl ? (
          <div
            className="w-full overflow-hidden rounded-xl"
            style={{
              backgroundColor: 'var(--color-background-muted)',
              border: '1px solid var(--color-border)',
            }}>
            <img
              src={preview.imageUrl}
              alt={preview.title}
              className="block w-full"
              style={{maxHeight: '38vh', objectFit: 'contain'}}
            />
          </div>
        ) : (
          <Banner
            status="warning"
            title="No picture on that page"
            description="The shop doesn't publish one we can use, and a garment with no photo can't be tried on. If you have the thing in front of you, photograph it instead."
          />
        )}

        {!preview.looksLikeProduct && preview.imageUrl && (
          <Banner
            status="warning"
            title="This might not be a product page"
            description="It reads more like a homepage or a listing. Check the name and the picture are the piece you meant."
          />
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

        <TextInput
          label="Name it"
          description="So you can tell it apart on the hanger."
          value={title}
          onChange={setTitle}
          isDisabled={busy}
          placeholder={preview.title}
        />

        <VStack gap={2}>
          <Text type="label">Where it goes</Text>
          <CategoryPick
            categories={LINKABLE}
            value={category}
            onChange={setCategory}
            isDisabled={busy}
          />
          <Text type="supporting">
            {category === preview.category
              ? "Our guess, from the page. Change it if it's wrong — it decides where a try-on fits."
              : `Changed from ${CATEGORY_LABELS[preview.category]}.`}
          </Text>
        </VStack>

        {preview.price && (
          <HStack justify="between" vAlign="center">
            <Text type="label">Price</Text>
            <Text type="supporting">{formatPrice(preview.price)}</Text>
          </HStack>
        )}

        {busy ? (
          <Card>
            <HStack gap={3} vAlign="center">
              <Spinner />
              <Text>Hanging it</Text>
            </HStack>
          </Card>
        ) : (
          <VStack gap={2}>
            {preview.imageUrl ? (
              <Button
                label="Hang it"
                variant="primary"
                isDisabled={title.trim().length === 0}
                onClick={hang}
              />
            ) : (
              <Button
                label="Photograph it instead"
                variant="primary"
                onClick={onPhotograph}
              />
            )}
            <Button
              label="Try a different link"
              variant="ghost"
              onClick={() => {
                setPreview(null);
                setStage('paste');
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
        <Heading level={2}>Paste a link</Heading>
        <Text type="supporting">
          A product page from any shop. We read it the same way the laptop does,
          and you check we got it right.
        </Text>
      </VStack>

      {error != null && (
        <ErrorNote
          error={error}
          title="We couldn't read that"
          onAction={() => void read(url)}
          actionLabel="Try again"
          onDismiss={() => setError(null)}
        />
      )}

      <TextInput
        label="Link"
        description="Paste the address of the product page."
        value={url}
        onChange={setUrl}
        onEnter={() => looksLikeLink(url) && void read(url)}
        placeholder="https://"
        hasClear
      />

      <VStack gap={2}>
        <Button
          label="Read it"
          variant="primary"
          isDisabled={!looksLikeLink(url)}
          onClick={() => void read(url)}
        />
        <Button label="Not now" variant="ghost" onClick={onCancel} />
      </VStack>
    </VStack>
  );
}

/**
 * Enough to enable the button, not enough to be an opinion. The server does the
 * real checking — it is the one that has to fetch the thing.
 */
function looksLikeLink(value: string): boolean {
  const trimmed = value.trim();
  return /^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(trimmed);
}

function hostOf(value: string): string {
  try {
    return new URL(value.trim()).hostname.replace(/^www\d?\./, '');
  } catch {
    return 'the page';
  }
}
