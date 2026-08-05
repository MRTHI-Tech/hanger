import {useCallback, useEffect, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Banner} from '@astryxdesign/core/Banner';
import {Badge} from '@astryxdesign/core/Badge';
import {Divider} from '@astryxdesign/core/Divider';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Spinner} from '@astryxdesign/core/Spinner';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {api, mediaUrl} from '../api';
import {GarmentCard} from '../components/GarmentCard';
import {OutfitSlotRow} from '../components/OutfitSlot';
import {BeforeAfter} from '../components/BeforeAfter';
import {ErrorNote} from '../components/ErrorNote';
import {formatAmount, formatPrice} from '../format';
import {
  isOwned,
  SLOT_CATEGORIES,
  SLOT_LABELS,
  SLOT_ORDER,
  type Garment,
  type Outfit,
  type OutfitSlot,
  type OutfitVideo,
  type Person,
} from '../../shared/types';

type Filled = Partial<Record<OutfitSlot, Garment>>;

export function OutfitBuilder({
  person,
  initial,
  onDone,
  onAddOwned,
}: {
  person: Person;
  initial?: Filled;
  onDone: () => void;
  onAddOwned: () => void;
}) {
  const [wardrobe, setWardrobe] = useState<Garment[] | null>(null);
  const [filled, setFilled] = useState<Filled>(initial ?? {});
  const [picking, setPicking] = useState<OutfitSlot | null>(null);
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    api.listGarments().then(setWardrobe).catch(setError);
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, []);

  const chosen = SLOT_ORDER.filter((slot) => filled[slot]);
  const hasFullBody = chosen.some(
    (slot) => filled[slot]?.category === 'full_body',
  );

  const put = useCallback(
    (slot: OutfitSlot, garment: Garment) => {
      setFilled((current) => ({...current, [slot]: garment}));
      setPicking(null);
      setOutfit(null);
    },
    [],
  );

  function putById(slot: OutfitSlot, garmentId: string) {
    const garment = wardrobe?.find((g) => g.id === garmentId);
    if (!garment) return;
    if (!SLOT_CATEGORIES[slot].includes(garment.category)) {
      setError(
        new Error(
          `A ${garment.category.replace('_', ' ')} piece doesn't go in the ${SLOT_LABELS[
            slot
          ].toLowerCase()} slot.`,
        ),
      );
      return;
    }
    setError(null);
    put(slot, garment);
  }

  /** Tapping a card drops it in the first slot that will take it. */
  function autoPlace(garment: Garment) {
    const slot = SLOT_ORDER.find(
      (s) => SLOT_CATEGORIES[s].includes(garment.category) && !filled[s],
    );
    if (slot) {
      put(slot, garment);
      return;
    }
    const fallback = SLOT_ORDER.find((s) =>
      SLOT_CATEGORIES[s].includes(garment.category),
    );
    if (fallback) put(fallback, garment);
  }

  async function build() {
    setError(null);
    setRunning(true);
    try {
      const items = chosen.map((slot) => ({
        garmentId: filled[slot]!.id,
        slot,
      }));
      const created = await api.createOutfit(items);
      // An outfit built from pieces we've already run comes back finished.
      // Waiting a poll interval to discover that just looks like lag.
      poll(created.outfitId, created.status !== 'running');
    } catch (e) {
      setError(e);
      setRunning(false);
    }
  }

  function poll(id: string, immediate = false) {
    pollTimer.current = window.setTimeout(async () => {
      try {
        const next = await api.getOutfit(id);
        setOutfit(next);
        if (next.status === 'running' || next.status === 'pending') {
          poll(id);
          return;
        }
        setRunning(false);
      } catch (e) {
        setError(e);
        setRunning(false);
      }
    }, immediate ? 0 : 1200);
  }

  if (picking) {
    return (
      <Picker
        slot={picking}
        wardrobe={wardrobe ?? []}
        onPick={(garment) => put(picking, garment)}
        onCancel={() => setPicking(null)}
        onAddOwned={onAddOwned}
      />
    );
  }

  if (outfit && outfit.status === 'success' && outfit.resultUrl) {
    return (
      <Finished
        outfit={outfit}
        person={person}
        onEdit={() => setOutfit(null)}
        onDone={onDone}
      />
    );
  }

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Build an outfit</Heading>
        <Text type="supporting">
          Mix pieces from different shops. We fit them one at a time, in order.
        </Text>
      </VStack>

      <Card padding={2}>
        <VStack gap={0}>
          {SLOT_ORDER.map((slot, index) => (
            <div key={slot}>
              {index > 0 && <Divider />}
              <OutfitSlotRow
                slot={slot}
                garment={filled[slot] ?? null}
                isTarget
                onDrop={(id) => putById(slot, id)}
                onClear={() =>
                  setFilled((current) => {
                    const next = {...current};
                    delete next[slot];
                    return next;
                  })
                }
                onPick={() => setPicking(slot)}
              />
            </div>
          ))}
        </VStack>
      </Card>

      {hasFullBody && (filled.top || filled.bottom) && (
        <Banner
          status="info"
          title="A full-body piece takes the whole look"
          description="We'll fit the dress or jumpsuit and leave the top and bottom out."
        />
      )}

      {error != null && (
        <ErrorNote
          error={error}
          title="That didn't work"
          onDismiss={() => setError(null)}
          onAction={() => setError(null)}
          actionLabel="Got it"
        />
      )}

      {outfit && outfit.status === 'error' && (
        <ErrorNote
          error={new Error(outfit.message ?? 'We could not build that outfit.')}
          title="We couldn't build that"
          actionLabel="Try again"
          onAction={build}
        />
      )}

      {running ? (
        <Card variant="muted">
          <VStack gap={2}>
            <Text type="label">
              {outfit?.progress.label || 'Getting started…'}
            </Text>
            <ProgressBar
              label="Building the outfit"
              isLabelHidden
              value={outfit ? outfit.progress.step : 0}
              max={Math.max(1, outfit?.progress.of ?? chosen.length)}
            />
            <Text type="supporting">
              Step {outfit?.progress.step ?? 0} of{' '}
              {outfit?.progress.of ?? chosen.length}. Each piece is fitted onto
              the last result, so this takes a moment.
            </Text>
          </VStack>
        </Card>
      ) : (
        <Button
          label={
            chosen.length === 0
              ? 'Add a piece to start'
              : `Put it together (${chosen.length})`
          }
          variant="primary"
          isDisabled={chosen.length === 0}
          onClick={build}
        />
      )}

      <Divider label="Your Hanger" />

      {wardrobe && wardrobe.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {wardrobe.map((garment) => (
            <GarmentCard
              key={garment.id}
              garment={garment}
              onClick={() => autoPlace(garment)}
              isSelected={chosen.some((slot) => filled[slot]?.id === garment.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          isCompact
          title="Nothing to build with yet"
          description="Hang a few pieces first, then combine them here. Things you already own count."
          actions={
            <Button
              label="Add something you own"
              variant="secondary"
              onClick={onAddOwned}
            />
          }
        />
      )}
    </VStack>
  );
}

function Picker({
  slot,
  wardrobe,
  onPick,
  onCancel,
  onAddOwned,
}: {
  slot: OutfitSlot;
  wardrobe: Garment[];
  onPick: (garment: Garment) => void;
  onCancel: () => void;
  onAddOwned: () => void;
}) {
  const eligible = wardrobe.filter((g) =>
    SLOT_CATEGORIES[slot].includes(g.category),
  );

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>Choose a {SLOT_LABELS[slot].toLowerCase()}</Heading>
        <Text type="supporting">
          {eligible.length} {eligible.length === 1 ? 'piece' : 'pieces'} in Your
          Hanger fit this slot.
        </Text>
      </VStack>

      {eligible.length === 0 ? (
        <EmptyState
          title={`No ${SLOT_LABELS[slot].toLowerCase()} yet`}
          description="Try one on from a shop and tap Hang it — or photograph one you already own."
          actions={
            <VStack gap={2}>
              <Button
                label="Add something you own"
                variant="secondary"
                onClick={onAddOwned}
              />
              <Button label="Back" variant="ghost" onClick={onCancel} />
            </VStack>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {eligible.map((garment) => (
              <GarmentCard
                key={garment.id}
                garment={garment}
                isDraggable={false}
                actionLabel="Use"
                onClick={() => onPick(garment)}
              />
            ))}
          </div>
          <Button label="Back" variant="ghost" onClick={onCancel} />
        </>
      )}
    </VStack>
  );
}

function Finished({
  outfit,
  person,
  onEdit,
  onDone,
}: {
  outfit: Outfit;
  person: Person;
  onEdit: () => void;
  onDone: () => void;
}) {
  const worn = outfit.items.filter((item) => !item.skipped);

  return (
    <VStack padding={4} gap={4}>
      <VStack gap={1}>
        <Heading level={2}>{outfit.name ?? 'Your outfit'}</Heading>
        <Text type="supporting">
          {worn.length} pieces from{' '}
          {new Set(worn.map((i) => i.garment.retailer)).size} shops, on you.
        </Text>
      </VStack>

      <ShareVideo
        outfit={outfit}
        beforeUrl={mediaUrl(person.photoUrl)}
        afterUrl={mediaUrl(outfit.resultUrl!)}
      />

      {outfit.partialNote && (
        <Banner
          status="warning"
          title="Not everything made it"
          description={outfit.partialNote}
        />
      )}

      <Card padding={3}>
        <VStack gap={3}>
          <Text type="label">What you're wearing</Text>
          {worn.map((item) => (
            <WornRow key={item.slot} item={item} />
          ))}

          {outfit.items.some((i) => i.skipped) && (
            <Text type="supporting">
              Left out:{' '}
              {outfit.items
                .filter((i) => i.skipped)
                .map((i) => i.garment.title)
                .join(', ')}
            </Text>
          )}

          {outfit.total && (
            <>
              <Divider />
              <HStack justify="between" vAlign="center">
                {/* Once part of the look is already in your wardrobe, the
                    number underneath it isn't what the outfit costs — it's
                    what's left to buy, and saying so is the point. */}
                <Text type="label">
                  {worn.some((item) => isOwned(item.garment)) ? 'To buy' : 'Total'}
                </Text>
                <Badge
                  variant="neutral"
                  label={formatAmount(outfit.total.amount, outfit.total.currency)}
                />
              </HStack>
            </>
          )}
        </VStack>
      </Card>

      <VStack gap={2}>
        <Button label="Change something" variant="secondary" onClick={onEdit} />
        <Button label="Done" variant="primary" onClick={onDone} />
      </VStack>
    </VStack>
  );
}

/**
 * A still is hard to send someone and ask "does this work?" — a few seconds of
 * motion is the thing people actually forward. Built on demand rather than with
 * every outfit: it's a second paid task, and most outfits never get shared.
 */
function ShareVideo({
  outfit,
  beforeUrl,
  afterUrl,
}: {
  outfit: Outfit;
  beforeUrl: string;
  afterUrl: string;
}) {
  const [video, setVideo] = useState<OutfitVideo>(
    outfit.video ?? {status: 'idle'},
  );
  /** Set by "Back to the photo" — the video still exists, we're just not on it. */
  const [showStill, setShowStill] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pollTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    },
    [],
  );

  function poll() {
    pollTimer.current = window.setTimeout(async () => {
      try {
        const next = await api.getOutfit(outfit.id);
        const state = next.video ?? {status: 'idle' as const};
        setVideo(state);
        if (state.status === 'running' || state.status === 'pending') poll();
      } catch (e) {
        setError(e);
      }
    }, 1400);
  }

  async function make() {
    setError(null);
    setVideo({status: 'running'});
    try {
      const next = await api.createOutfitVideo(outfit.id);
      setVideo(next.video ?? {status: 'running'});
      poll();
    } catch (e) {
      setError(e);
      setVideo({status: 'idle'});
    }
  }

  const done = video.status === 'success' && Boolean(video.url);

  // Once there's a video it takes over the image area — it *is* the outfit,
  // moving, and stacking it under the still would ask which one to look at.
  if (done && !showStill) {
    return (
      <VStack gap={2}>
        <VideoPlayer url={mediaUrl(video.url!)} />
        <HStack gap={2}>
          <Button
            label="Save the video"
            variant="secondary"
            size="sm"
            onClick={() => window.open(mediaUrl(video.url!), '_blank')}
          />
          <Button
            label="Back to the photo"
            variant="ghost"
            size="sm"
            onClick={() => setShowStill(true)}
          />
        </HStack>
      </VStack>
    );
  }

  const busy = video.status === 'running' || video.status === 'pending';

  return (
    <VStack gap={2}>
      <BeforeAfter
        beforeUrl={beforeUrl}
        afterUrl={afterUrl}
        alt="Your outfit"
        action={
          busy ? (
            <div
              className="flex items-center gap-2 rounded-full px-3 py-2"
              style={{
                color: 'var(--color-on-dark)',
                backgroundColor: 'var(--color-overlay)',
                backdropFilter: 'blur(4px)',
              }}>
              <Spinner size="sm" />
              <Text type="supporting" color="inherit">
                Making your video
              </Text>
            </div>
          ) : done ? (
            // The video is already made and paid for — this returns to it
            // rather than offering to build a second one.
            <Button
              label="Play the video"
              variant="primary"
              size="sm"
              onClick={() => setShowStill(false)}
            />
          ) : (
            <Button
              label="Generate video"
              variant="primary"
              size="sm"
              onClick={() => void make()}
            />
          )
        }
      />

      {busy && <Text type="supporting">This takes about a minute.</Text>}

      {error != null && (
        <ErrorNote
          error={error}
          title="That video didn't work"
          actionLabel="Try again"
          onAction={() => void make()}
        />
      )}

      {video.status === 'error' && (
        // A recognised failure has copy worth reading ("we're out of credits").
        // An unrecognised one only produces "something went wrong on our side",
        // which is worse than saying the one thing that actually matters here.
        <Banner
          status="warning"
          title="We couldn't make the video"
          description={
            video.code && video.code !== 'unknown' && video.message
              ? video.message
              : 'Your outfit is fine and still saved — only the video failed.'
          }
          endContent={
            <Button label="Try again" variant="ghost" onClick={() => void make()} />
          }
        />
      )}
    </VStack>
  );
}

/**
 * Mock results are animated SVG and live ones are mp4, so the player follows
 * the file rather than the mode — an <img> animates the SVG, <video> plays the
 * real thing.
 */
function VideoPlayer({url}: {url: string}) {
  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);

  const frame = {
    width: '100%',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    border: '1px solid var(--color-border)',
  } as const;

  if (!isVideo) {
    return <img src={url} alt="Your outfit, moving" style={frame} />;
  }

  return (
    <video
      src={url}
      style={frame}
      controls
      autoPlay
      loop
      muted
      playsInline
      aria-label="Your outfit, moving"
    />
  );
}

/**
 * One line of the buy list. The panel is 320–480px and garment titles run to
 * 60+ characters, so a title here could only ever be truncated — and it pushed
 * the price and View off the edge entirely. The thumbnail says which piece this
 * is faster than the text did, and nothing in the row can outgrow the panel.
 *
 * The title still carries the row for anyone not looking at it: it's the image
 * alt and it names the View button.
 *
 * A piece you already own has no price and nowhere to go — it takes "Yours"
 * where the price would be, and no button. That's the whole point of the mixed
 * list: what's left is only what you'd have to buy.
 */
function WornRow({item}: {item: Outfit['items'][number]}) {
  const {garment} = item;
  const owned = isOwned(garment);

  return (
    <HStack gap={3} vAlign="center">
      <img
        src={mediaUrl(garment.imageUrl)}
        alt={`${SLOT_LABELS[item.slot]}: ${garment.title}${
          owned ? ', already yours' : ''
        }`}
        className="shrink-0 rounded-lg"
        style={{
          width: 44,
          height: 44,
          objectFit: 'cover',
          backgroundColor: 'var(--color-background-muted)',
          border: '1px solid var(--color-border)',
        }}
      />

      {/* Grows to fill, so the prices line up in a column above the total. */}
      <div style={{flex: 1, minWidth: 0, textAlign: 'right'}}>
        {owned ? (
          <Text type="supporting">Yours</Text>
        ) : (
          garment.price && (
            <Text type="supporting" color="primary">
              {formatPrice(garment.price)}
            </Text>
          )
        )}
      </div>

      {!owned && (
        <div className="shrink-0">
          <Button
            label="View"
            aria-label={`View ${garment.title} at ${garment.retailer}`}
            variant="ghost"
            size="sm"
            onClick={() => {
              if (garment.productUrl) window.open(garment.productUrl, '_blank');
            }}
          />
        </div>
      )}
    </HStack>
  );
}
