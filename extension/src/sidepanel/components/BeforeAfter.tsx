import {useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';

/**
 * The result, with the original one tap away. Seeing the two side by side is
 * the whole proposition — "how would this look on me" only means something
 * against "how do I look now".
 */
export function BeforeAfter({
  beforeUrl,
  afterUrl,
  alt = 'Try-on result',
}: {
  beforeUrl?: string;
  afterUrl: string;
  alt?: string;
}) {
  const [view, setView] = useState<'after' | 'before'>('after');
  const showing = view === 'before' && beforeUrl ? beforeUrl : afterUrl;

  return (
    <VStack gap={2}>
      <div
        className="w-full overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--color-background-muted)',
          border: '1px solid var(--color-border)',
        }}>
        <img
          src={showing}
          alt={view === 'before' ? 'Your photo' : alt}
          className="block w-full"
          style={{maxHeight: 460, objectFit: 'contain'}}
        />
      </div>

      {beforeUrl && (
        <SegmentedControl
          label="Compare"
          value={view}
          onChange={(v) => setView(v as 'after' | 'before')}
          layout="fill"
          size="sm">
          <SegmentedControlItem value="before" label="Your photo" />
          <SegmentedControlItem value="after" label="Wearing it" />
        </SegmentedControl>
      )}
    </VStack>
  );
}
