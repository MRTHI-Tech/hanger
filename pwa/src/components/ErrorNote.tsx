import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {HangerError} from '@hanger/shared/api';

/**
 * The single place an error becomes visible on the phone. §13: a human sentence
 * and a way out, every time — never a raw code, never a dead end.
 *
 * The panel has its own version of this. The sentences differ because the
 * failures do: the panel's advice is about shop pages and the extension losing
 * its grip on one. A phone's usual problem is simpler and almost always the
 * same one — it isn't on the same Wi-Fi as the laptop, or the laptop isn't
 * running the server.
 */
const RAW_ERROR_PATTERNS: {test: RegExp; message: string}[] = [
  {
    test: /failed to fetch|networkerror|load failed|err_/i,
    message:
      "We couldn't reach the Hanger server. Check your phone is on the same Wi-Fi as the laptop, and that the laptop is running it.",
  },
  {
    test: /^\s*(typeerror|referenceerror|syntaxerror|error):/i,
    message: 'Something went wrong on our side. Try that again.',
  },
];

function humanMessage(error: unknown): string {
  const raw =
    error instanceof HangerError
      ? error.message
      : error instanceof Error && error.message
        ? error.message
        : '';
  if (!raw) return 'Something went wrong. Try that again.';

  // Anything carrying a §13 code has already been written for a person.
  if (error instanceof HangerError) return raw;

  const match = RAW_ERROR_PATTERNS.find((p) => p.test.test(raw));
  return match ? match.message : raw;
}

export function ErrorNote({
  error,
  title = 'That did not work',
  actionLabel,
  onAction,
  onDismiss,
}: {
  error: unknown;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  const message = humanMessage(error);
  const hint = (error as {hint?: unknown})?.hint;
  const label =
    actionLabel ?? (typeof hint === 'string' && hint ? hint : 'Try again');

  return (
    <Banner
      status="error"
      title={title}
      description={message}
      isDismissable={Boolean(onDismiss)}
      onDismiss={onDismiss}
      endContent={
        onAction ? (
          <Button label={label} variant="secondary" size="sm" onClick={onAction} />
        ) : undefined
      }
    />
  );
}
