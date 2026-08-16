/**
 * What every generated illustration is made of.
 *
 * Hand-written, unlike its neighbours in this folder: the drawings change, this
 * doesn't. Keeping it out of the generator means there is one `<svg>` to be
 * right about rather than one per set, and a second set costs a file of path
 * data instead of a second copy of this.
 *
 * The viewBox arrives as a prop because it belongs to the set, not to this:
 * build-illustrations.mjs checks that every drawing in a set agrees on one, and
 * passes that through.
 */
import type {SVGProps} from 'react';

export interface IllustrationProps
  extends Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'> {
  /**
   * An accessible name. Omit it where the drawing sits next to a caption that
   * already says the same thing — which is every use today — and it is marked
   * decorative instead of read out twice.
   */
  title?: string;
}

export function Illustration({
  d,
  viewBox,
  title,
  ...rest
}: IllustrationProps & {d: string; viewBox: string}) {
  return (
    <svg
      viewBox={viewBox}
      width="100%"
      height="100%"
      {...(title ? {role: 'img', 'aria-label': title} : {'aria-hidden': true})}
      {...rest}>
      <path d={d} fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}
