import {useCallback, useEffect, useState} from 'react';
import {ChevronLeft} from 'lucide-react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Spinner} from '@astryxdesign/core/Spinner';
import {api, mediaUrl} from '@hanger/shared/api';
import {formatAmount, formatPrice} from '@hanger/shared/format';
import {
  DEFAULT_VIDEO_POSE,
  isOwned,
  SLOT_LABELS,
  videoPoseLabel,
  VIDEO_POSES,
  type Outfit,
  type VideoPose,
} from '@hanger/shared/types';
import {Later} from '../components/Later';
import {ErrorNote} from '../components/ErrorNote';
import {usePollWhileVisible} from '../poll';

/**
 * One saved look, full screen.
 *
 * On a phone this is the payoff: the finished outfit big enough to actually
 * look at, the video if one was made on the laptop, and the list of what it
 * would cost to buy. Sharing it is the next phase — the button that belongs
 * here is the phone's own share sheet, and that's Phase 7.
 */
export function OutfitDetail({
  outfit: initial,
  onBack,
}: {
  outfit: Outfit;
  onBack: () => void;
}) {
  // Seeded from the list's copy, then owned here: making a video changes this
  // outfit, and the row on the server is what says how it's going.
  const [outfit, setOutfit] = useState<Outfit>(initial);
  useEffect(() => setOutfit(initial), [initial]);

  // Openable while it's still assembling — from the grid, or by coming back to
  // a phone that was locked through the whole chain.
  const assembling = outfit.status === 'running' || outfit.status === 'pending';
  usePollWhileVisible(
    useCallback(async () => {
      try {
        setOutfit(await api.getOutfit(outfit.id));
      } catch {
        // Keep showing the last good state; the next tick tries again.
      }
    }, [outfit.id]),
    assembling,
    3000,
  );

  const worn = outfit.items.filter((item) => !item.skipped);
  const shops = new Set(
    worn.map((i) => i.garment.retailer).filter((r): r is string => r != null),
  ).size;
  const video = outfit.video;
  const hasVideo = video?.status === 'success' && Boolean(video.url);

  return (
    <VStack padding={4} gap={4}>
      <HStack gap={2} vAlign="center">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to your outfits"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '2.75rem',
            minHeight: '2.75rem',
            marginLeft: '-0.75rem',
            background: 'none',
            border: 'none',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
          }}>
          <ChevronLeft size={24} aria-hidden />
        </button>
        <VStack gap={0.5}>
          <Heading level={2}>{outfit.name ?? 'Your outfit'}</Heading>
          <Text type="supporting">{summarise(worn.length, shops)}</Text>
        </VStack>
      </HStack>

      {hasVideo ? (
        <VStack gap={1}>
          <VideoPlayer url={mediaUrl(video.url!)} />
          {/* Which motion was picked on the laptop. Only worth a line once the
              choice exists — an older video has no pose recorded. */}
          {video.pose && (
            <Text type="supporting">{videoPoseLabel(video.pose)}</Text>
          )}
        </VStack>
      ) : outfit.resultUrl ? (
        <img
          src={mediaUrl(outfit.resultUrl)}
          alt="Your outfit"
          style={{
            width: '100%',
            borderRadius: 'var(--radius-container)',
            backgroundColor: 'var(--color-background-muted)',
            border: '1px solid var(--color-border)',
          }}
        />
      ) : (
        <Banner
          status="warning"
          title={
            outfit.status === 'error' ? 'This one did not finish' : 'Still working'
          }
          description={
            outfit.message ??
            'There is no picture for this look yet. Open it on the laptop to see what happened.'
          }
        />
      )}

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

      {outfit.status === 'success' && outfit.resultUrl && (
        <VideoCard outfit={outfit} onChange={setOutfit} />
      )}

      <Later phase="Phase 7">Send this to someone on WhatsApp</Later>
    </VStack>
  );
}

/**
 * Make the look move.
 *
 * Only offered on a finished outfit, because there has to be an image to
 * animate. The pose picker is here rather than buried behind a default: the
 * four motions produce genuinely different videos, and the server treats the
 * same outfit walking as a different render from the same outfit standing
 * still — so choosing is the difference between one video and two.
 *
 * A video costs four units where a try-on costs one, and it takes a couple of
 * minutes. The wait says so, and says it keeps going without you.
 */
function VideoCard({
  outfit,
  onChange,
}: {
  outfit: Outfit;
  onChange: (outfit: Outfit) => void;
}) {
  const [pose, setPose] = useState<VideoPose>(
    outfit.video?.pose ?? DEFAULT_VIDEO_POSE,
  );
  const [error, setError] = useState<unknown>(null);
  const video = outfit.video;
  const running = video?.status === 'running' || video?.status === 'pending';
  const done = video?.status === 'success' && Boolean(video.url);

  usePollWhileVisible(
    useCallback(async () => {
      try {
        onChange(await api.getOutfit(outfit.id));
      } catch (e) {
        setError(e);
      }
    }, [outfit.id, onChange]),
    running,
    2500,
  );

  async function make() {
    setError(null);
    try {
      onChange(await api.createOutfitVideo(outfit.id, pose));
    } catch (e) {
      setError(e);
    }
  }

  // Already playing at the top of the screen — the only thing left to offer is
  // a different motion, and that's a fresh render rather than a state of this
  // one, so it reads as its own choice.
  if (done && video?.pose === pose) {
    return (
      <Card padding={3}>
        <VStack gap={3}>
          <VStack gap={1}>
            <Text type="label">Another motion</Text>
            <Text type="supporting">
              This one is a {videoPoseLabel(pose)} video. Pick a different motion
              and we'll render that as well — the first one is kept.
            </Text>
          </VStack>
          <PosePicker pose={pose} onChange={setPose} isDisabled={false} />
        </VStack>
      </Card>
    );
  }

  return (
    <Card padding={3}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Text type="label">{done ? 'Make another' : 'Make a video'}</Text>
          <Text type="supporting">
            {running
              ? 'Rendering. This takes a couple of minutes, and carries on if you lock your phone.'
              : 'Turn this look into a few seconds of video you can send to someone.'}
          </Text>
        </VStack>

        {video?.status === 'error' && (
          <Banner
            status="warning"
            title="The video didn't render"
            description={video.message ?? 'Something went wrong making it.'}
          />
        )}

        {error != null && (
          <ErrorNote
            error={error}
            title="That didn't work"
            onDismiss={() => setError(null)}
          />
        )}

        {running ? (
          <HStack gap={3} vAlign="center">
            <Spinner />
            <Text type="supporting">{videoPoseLabel(pose)}</Text>
          </HStack>
        ) : (
          <>
            <PosePicker pose={pose} onChange={setPose} isDisabled={false} />
            <Button label="Make the video" variant="primary" onClick={make} />
          </>
        )}
      </VStack>
    </Card>
  );
}

function PosePicker({
  pose,
  onChange,
  isDisabled,
}: {
  pose: VideoPose;
  onChange: (pose: VideoPose) => void;
  isDisabled: boolean;
}) {
  return (
    <VStack gap={2}>
      <div className="grid grid-cols-2 gap-2">
        {VIDEO_POSES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={isDisabled}
            aria-pressed={pose === option.value}
            className="w-full rounded-xl px-3"
            style={{
              border: `1px solid ${
                pose === option.value
                  ? 'var(--color-accent)'
                  : 'var(--color-border)'
              }`,
              backgroundColor:
                pose === option.value
                  ? 'var(--color-accent-muted)'
                  : 'transparent',
              color: 'var(--color-text-primary)',
              font: 'inherit',
              fontSize: 'var(--font-size-sm)',
              minHeight: '2.75rem',
              cursor: isDisabled ? 'default' : 'pointer',
            }}>
            {option.label}
          </button>
        ))}
      </div>
      <Text type="supporting">
        {VIDEO_POSES.find((p) => p.value === pose)?.description}
      </Text>
    </VStack>
  );
}

function summarise(pieces: number, shops: number): string {
  const p = `${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`;
  if (shops === 0) return `${p} from your own wardrobe, on you`;
  return `${p} from ${shops} ${shops === 1 ? 'shop' : 'shops'}, on you`;
}

/**
 * Mock results are animated SVG and live ones are mp4, so the player follows
 * the file rather than the mode — an <img> animates the SVG, <video> plays the
 * real thing. `playsInline` matters here and nowhere else: without it, iOS
 * throws the video into its own fullscreen player the moment it starts.
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
 * One line of the buy list. The thumbnail says which piece this is faster than
 * the text could, and nothing in the row can outgrow a phone's width.
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

      {!owned && garment.productUrl && (
        <div className="shrink-0">
          <Button
            label="View"
            aria-label={`View ${garment.title} at ${garment.retailer ?? 'the shop'}`}
            variant="ghost"
            size="sm"
            onClick={() => window.open(garment.productUrl!, '_blank')}
          />
        </div>
      )}
    </HStack>
  );
}
