// A band heading: the animated section icon, the section name (large), and
// the one-line description beneath. The icon plays once when the heading
// scrolls into view (Motion.tsx).

import SectionIcon from "./SectionIcon";
import type { Section } from "./sections";

export default function BandHeading({ s }: { s: Section }) {
  return (
    <div className="band-head">
      <SectionIcon name={s.icon} size={48} />
      <div>
        <h2 className="row-title band-title-xl">{s.name}</h2>
        <p className="band-desc">{s.desc}</p>
      </div>
    </div>
  );
}
