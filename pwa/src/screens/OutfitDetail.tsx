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
import {mediaUrl} from '@hanger/shared/api';
import {formatAmount, formatPrice} from '@hanger/shared/format';
import {
  isOwned,
  SLOT_LABELS,
  videoPoseLabel,
  type Outfit,
} from '@hanger/shared/types';
import {Later} from '../components/Later';

/**
 * One saved look, full screen.
 *
 * On a phone this is the payoff: the finished outfit big enough to actually
 * look at, the video if one was made on the laptop, and the list of what it
 * would cost to buy. Sharing it is the next phase — the button that belongs
 * here is the phone's own share sheet, and that's Phase 7.
 */
export function OutfitDetail({
  outfit,
  onBack,
}: {
  outfit: Outfit;
  onBack: () => void;
}) {
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

      <Later phase="Phase 7">Send this to someone on WhatsApp</Later>
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
