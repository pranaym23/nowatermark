/**
 * Homepage intake: lets one panel handle both an image and pasted text.
 *
 * Both panels stay mounted and the inactive one is hidden, so switching tabs
 * does not throw away a scan the user has already run. Neither scanner does
 * any work until it is given input, so mounting both costs nothing.
 *
 * Implements the ARIA tabs pattern properly: roving tabindex, arrow-key
 * navigation, and Home/End — a plain pair of buttons would leave keyboard
 * users without a way to move between them predictably.
 */

import { useCallback, useId, useRef, useState } from 'react';

import ImageScanner from './ImageScanner';
import TextScanner from './TextScanner';

type TabId = 'image' | 'text';

const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  { id: 'image', label: 'File', hint: 'Images, SVG, Markdown, PDF' },
  { id: 'text', label: 'Text', hint: 'Paste anything' },
];

export default function ScannerTabs() {
  const [active, setActive] = useState<TabId>('image');
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const order = TABS.map((t) => t.id);
      const index = order.indexOf(active);
      let next: TabId | null = null;

      if (event.key === 'ArrowRight') next = order[(index + 1) % order.length]!;
      else if (event.key === 'ArrowLeft') next = order[(index - 1 + order.length) % order.length]!;
      else if (event.key === 'Home') next = order[0]!;
      else if (event.key === 'End') next = order[order.length - 1]!;

      if (next) {
        event.preventDefault();
        setActive(next);
        tabRefs.current[next]?.focus();
      }
    },
    [active],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <div
        role="tablist"
        aria-label="What do you want to check?"
        className="flex gap-0 border-b"
        style={{ borderColor: 'var(--nw-rule)' }}
      >
        {TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={onKeyDown}
              className="-mb-px flex items-baseline gap-2 px-4 py-2.5 text-sm transition-colors"
              style={{
                fontWeight: selected ? 700 : 500,
                color: selected ? 'var(--nw-ink)' : 'var(--nw-muted)',
                borderBottom: `3px solid ${selected ? 'var(--nw-spot)' : 'transparent'}`,
              }}
            >
              {tab.label}
              <span className="text-xs" style={{ color: 'var(--nw-faint)' }}>
                {tab.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-image`}
        aria-labelledby={`${baseId}-tab-image`}
        hidden={active !== 'image'}
      >
        <ImageScanner />
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-text`}
        aria-labelledby={`${baseId}-tab-text`}
        hidden={active !== 'text'}
      >
        <TextScanner />
      </div>
    </div>
  );
}
