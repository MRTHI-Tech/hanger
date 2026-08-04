import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {HangerError} from '../api';

/**
 * The single place an error becomes visible. §13: a human sentence and a way
 * out, every time — never a raw code, never a dead end.
 */
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
  const message =
    error instanceof HangerError
      ? error.message
      : error instanceof Error && error.message
        ? error.message
        : 'Something went wrong. Try that again.';
  const label =
    actionLabel ??
    (error instanceof HangerError && error.hint ? error.hint : 'Try again');

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
