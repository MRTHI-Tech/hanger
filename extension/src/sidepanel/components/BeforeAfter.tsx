import {useState, type ReactNode} from 'react';
import {Eye, EyeOff} from 'lucide-react';

/**
 * The result, with the original one tap away. Seeing the two side by side is
 * the whole proposition — "how would this look on me" only means something
 * against "how do I look now".
 *
 * The compare control sits on the image rather than under it. A segmented
 * control below the photo read as page furniture and cost a row of height in a
 * 320px panel; an eye button on the image is the same show/hide gesture people
 * already know from password fields, and it keeps the photo the whole subject.
 */
export function BeforeAfter({
  beforeUrl,
  afterUrl,
  alt = 'Try-on result',
  action,
}: {
  beforeUrl?: string;
  afterUrl: string;
  alt?: string;
  /** Optional control rendered alongside the compare toggle, over the image. */
  action?: ReactNode;
}) {
  const [view, setView] = useState<'after' | 'before'>('after');
  const isBefore = view === 'before' && Boolean(beforeUrl);
  const showing = isBefore ? beforeUrl! : afterUrl;

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      style={{
        backgroundColor: 'var(--color-background-muted)',
        border: '1px solid var(--color-border)',
      }}>
      <img
        src={showing}
        alt={isBefore ? 'Your photo' : alt}
        className="block w-full"
        style={{maxHeight: 460, objectFit: 'contain'}}
      />

      {(action || beforeUrl) && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-2">
          {action}
          {beforeUrl && (
            <button
              type="button"
              onClick={() => setView(isBefore ? 'after' : 'before')}
              aria-pressed={isBefore}
              aria-label={
                isBefore ? 'Show the outfit on you' : 'Show your photo without it'
              }
              title={isBefore ? 'Show the outfit on you' : 'Show your photo without it'}
              className="ml-auto flex shrink-0 items-center justify-center rounded-full"
              style={{
                width: 36,
                height: 36,
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-on-dark)',
                backgroundColor: 'var(--color-overlay)',
                backdropFilter: 'blur(4px)',
              }}>
              {isBefore ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
