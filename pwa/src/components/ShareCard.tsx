import {useEffect, useMemo, useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {
  canShareFiles,
  fileFromUrl,
  saveFile,
  shareErrorMessage,
  ShareRefused,
  shareFile,
} from '../share';
import {ErrorNote} from './ErrorNote';

/**
 * Send this to someone.
 *
 * Shares whatever is on the screen above it — an outfit's video, an outfit's
 * still, or you in the one garment you just tried on. One button, because the
 * thing you are looking at is the thing you mean, and a picker between files
 * you can't see at the moment of tapping would be a question nobody asked.
 *
 * **The file is fetched on mount, not on the tap.** The share sheet has to open
 * inside the tap that asked for it, and on iOS awaiting a fetch first spends
 * that permission — the sheet then refuses to open at all. So the bytes are
 * ready and waiting, which also makes the tap instant. It costs nothing in
 * practice: the same URL is already loaded into the `<video>` or `<img>` above,
 * and media is served immutable, so this is the cache answering.
 */
export function ShareCard({
  url,
  name,
  kind,
  variant = 'primary',
}: {
  url: string;
  name: string;
  kind: 'video' | 'picture';
  /**
   * How loud the button is. Primary where sending is the point of the screen —
   * a finished outfit — and secondary on the try-on, where the screen is asking
   * you whether to keep the thing and that question should stay the loudest one
   * on it.
   */
  variant?: 'primary' | 'secondary';
}) {
  const supported = useMemo(canShareFiles, []);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // A sheet that won't take the file isn't a failure to retry — the way out is
  // to save it, so that becomes the offer instead.
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    setFile(null);
    // Nothing to get ahead of without a share sheet: saving has no tap to be
    // inside of, so that path can fetch when it's asked to.
    if (!supported) return;

    const abort = new AbortController();
    void fileFromUrl(url, name, abort.signal).then(
      (ready) => setFile(ready),
      () => {
        // Quietly. Nobody has asked for anything yet, and an error banner for
        // a job they didn't start is noise. The tap tries again and speaks up
        // then if it has to.
      },
    );
    return () => abort.abort();
  }, [url, name, supported]);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      const ready = file ?? (await fileFromUrl(url, name));
      setFile(ready);
      if (supported) await shareFile(ready, name);
      else saveFile(ready);
    } catch (failure) {
      // Already a sentence for a person by the time it's stored — a raw
      // DOMException reads like a stack trace.
      setError(new Error(shareErrorMessage(failure)));
      if (failure instanceof ShareRefused) setRefused(true);
    } finally {
      setBusy(false);
    }
  }

  const noun = kind === 'video' ? 'the video' : 'the picture';

  return (
    <Card padding={3}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Text type="label">Send it to someone</Text>
          <Text type="supporting">
            {supported
              ? 'Straight into WhatsApp, Instagram, Messages — whatever you have.'
              : `This browser has no share sheet, so this saves ${noun} instead. You can send it from there.`}
          </Text>
        </VStack>

        {error && (
          <ErrorNote
            error={error}
            title="That didn't send"
            onDismiss={() => {
              setError(null);
              setRefused(false);
            }}
            actionLabel={refused ? `Save ${noun} instead` : 'Try again'}
            onAction={
              refused && file
                ? () => {
                    saveFile(file);
                    setError(null);
                    setRefused(false);
                  }
                : () => void send()
            }
          />
        )}

        <Button
          label={`${supported ? 'Send' : 'Save'} ${noun}`}
          variant={variant}
          width="100%"
          isLoading={busy}
          isDisabled={busy}
          onClick={() => void send()}
        />
      </VStack>
    </Card>
  );
}
