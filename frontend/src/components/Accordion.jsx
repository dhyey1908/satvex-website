import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import './Accordion.css';

/**
 * Simple single-open-at-a-time accordion. `items`: [{ id, title, body }] where
 * body is a string (split on blank lines into paragraphs) or a React node.
 * `idPrefix` keeps aria ids unique when two accordions share a page.
 */
export function Accordion({ items, idPrefix = 'acc', defaultOpenId = null }) {
  const [openId, setOpenId] = useState(defaultOpenId);
  if (!items?.length) return null;

  return (
    <div className="accordion">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id} className={`accordion-item ${open ? 'open' : ''}`}>
            <h3 className="accordion-heading">
              <button
                type="button"
                className="accordion-trigger"
                aria-expanded={open}
                aria-controls={`${idPrefix}-${item.id}`}
                onClick={() => setOpenId(open ? null : item.id)}
              >
                <span>{item.title}</span>
                <ChevronDown size={18} className="accordion-chevron" aria-hidden="true" />
              </button>
            </h3>
            {open && (
              <div id={`${idPrefix}-${item.id}`} className="accordion-body" role="region">
                {typeof item.body === 'string'
                  ? item.body.split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)
                  : item.body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
