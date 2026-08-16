import {useState} from 'react';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {
  ACCENTS,
  ACCENT_NAMES,
  applyAccent,
  storedAccent,
  type AccentName,
} from './accents';

/**
 * Choosing the accent.
 *
 * A segmented control rather than a cycling button: all three fit, and a
 * preference you can see the whole of is easier to trust than one you click
 * through. It is the same control the section nav uses, which is the point —
 * this is a setting, not a new idiom.
 *
 * It lives on the profile screen for the reason it is not in the header: you
 * set it once. A control in the header reads as something you use.
 *
 * The swatches come from each accent's own value, so this never becomes a
 * second place the colours are written down.
 */
export function AccentPicker() {
  const [accent, setAccent] = useState<AccentName>(storedAccent);

  return (
    <VStack gap={2}>
      <VStack gap={1}>
        <Text type="label">Theme</Text>
        <Text type="supporting">
          Changes the accent colour everywhere — this panel and your phone.
        </Text>
      </VStack>

      <SegmentedControl
        label="Theme"
        value={accent}
        onChange={(value) => {
          const name = value as AccentName;
          applyAccent(name);
          setAccent(name);
        }}
        layout="fill"
        size="md">
        {ACCENT_NAMES.map((name) => (
          <SegmentedControlItem
            key={name}
            value={name}
            label={ACCENTS[name].label}
            icon={<Swatch colour={ACCENTS[name].swatch} />}
          />
        ))}
      </SegmentedControl>
    </VStack>
  );
}

function Swatch({colour}: {colour: string}) {
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        height: 12,
        width: 12,
        borderRadius: '9999px',
        backgroundColor: colour,
        // Mono's swatch is close enough to the label's own colour that without
        // an edge it reads as a full stop rather than a colour.
        boxShadow: 'inset 0 0 0 1px var(--color-overlay-pressed)',
      }}
    />
  );
}
