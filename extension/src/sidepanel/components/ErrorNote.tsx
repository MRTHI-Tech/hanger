import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {HangerError} from '@hanger/shared/api';

/**
 * The single place an error becomes visible. §13: a human sentence and a way
 * out, every time — never a raw code, never a dead end.
 */
/**
 * Raw browser and runtime errors read like a stack trace to a shopper —
 * "Failed to fetch", "NetworkError", "Receiving end does not exist". §13 says
 * a raw code must never reach the UI, and this is the last line of defence
 * for anything that slipped past its own error handling.
 */
const RAW_ERROR_PATTERNS: {test: RegExp; message: string}[] = [
  {
    test: /failed to fetch|networkerror|load failed|err_/i,
    message:
      "We couldn't reach something we needed. Check the Hanger server is running, then try again.",
  },
  {
    test: /receiving end does not exist|could not establish connection|message port closed/i,
    message:
      'Hanger lost its connection to that page. Reload the shop page and try again.',
  },
  {
    test: /extension context invalidated/i,
    message: 'Hanger was updated. Reload the shop page to carry on.',
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
