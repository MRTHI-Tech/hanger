import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/VStack';
import {Text} from '@astryxdesign/core/Text';

/**
 * Says out loud that something isn't built yet.
 *
 * This app is deliberately read-only for now: it shows you your hanger, and
 * that's all. A greyed-out button with no explanation reads as broken, so
 * wherever an action is going to live later, this stands in its place and says
 * which phase brings it.
 */
export function Later({phase, children}: {phase: string; children: string}) {
  return (
    <Card variant="muted">
      <VStack gap={1}>
        <Text type="label">{children}</Text>
        <Text type="supporting">Coming in {phase}.</Text>
      </VStack>
    </Card>
  );
}
