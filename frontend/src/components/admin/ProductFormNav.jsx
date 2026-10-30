import { useEffect, useRef, useState } from 'react';
import './ProductFormNav.css';

/**
 * A sticky strip of tabs at the top of a long form: one tab per section. Clicking a tab scrolls to
 * that section; the tab of the section you are reading is highlighted as you scroll.
 * sections: [{ id, label, on?: boolean, error?: boolean }]
 *   - `on`: an optional section that is switched on (shows a small dot)
 *   - `error`: the section has a problem that blocks Save (shows a red dot)
 */
export function ProductFormNav({ sections }) {
  const [active, setActive] = useState(sections[0]?.id);
  // after a tab click the page is scrolling to its section: keep that tab lit until it arrives
  const lockedUntil = useRef(0);
  const recompute = useRef(() => {});

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const visible = new Map();
    // the first section (top to bottom) that is in the reading band wins
    const pick = () => {
      if (Date.now() < lockedUntil.current) return;
      const current = sections.find((s) => visible.get(s.id));
      if (current) setActive(current.id);
    };
    recompute.current = pick;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        pick();
      },
      { rootMargin: '-120px 0px -55% 0px' }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.map((s) => s.id).join('|')]);

  function go(e, id) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    lockedUntil.current = Date.now() + 1000;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
    // once the scroll has landed, go back to following the page
    window.setTimeout(() => recompute.current(), 1050);
  }

  return (
    <nav className="pfn" aria-label="Product form sections">
      <ul>
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`pfn-tab ${active === s.id ? 'is-active' : ''} ${s.error ? 'has-error' : ''}`}
              aria-current={active === s.id ? 'true' : undefined}
              onClick={(e) => go(e, s.id)}
            >
              {s.label}
              {s.error && <i className="pfn-dot is-error" aria-label="needs attention" />}
              {!s.error && s.on && <i className="pfn-dot is-on" aria-label="switched on" />}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
