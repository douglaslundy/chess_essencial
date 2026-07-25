'use client';

import { useEffect, useRef, useState } from 'react';

export interface GroupedListboxOption<Value extends string> {
  value: Value;
  label: string;
  detail?: string;
}

export interface GroupedListboxGroup<Value extends string> {
  label: string;
  options: Array<GroupedListboxOption<Value>>;
}

interface GroupedListboxProps<Value extends string> {
  groups: Array<GroupedListboxGroup<Value>>;
  value: Value;
  onChange: (value: Value) => void;
  ariaLabel: string;
}

// A custom-rendered dropdown standing in for a native <select>/<optgroup>.
// Native <option> elements only honor color/background-color in the open
// popup (padding, radius, hover highlight, dark theme are ignored by the
// OS-drawn list on most platforms), so no amount of CSS on a real <select>
// can match this app's visual language — this renders every pixel instead.
export function GroupedListbox<Value extends string>({
  groups,
  value,
  onChange,
  ariaLabel,
}: GroupedListboxProps<Value>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const allOptions = groups.flatMap((group) => group.options);
  const selected = allOptions.find((option) => option.value === value) ?? allOptions[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function select(option: GroupedListboxOption<Value>) {
    onChange(option.value);
    setOpen(false);
  }

  return (
    <div className="groupedListbox" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="groupedListboxButton"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="groupedListboxValue">
          <strong>{selected?.label}</strong>
          {selected?.detail ? <span>{selected.detail}</span> : null}
        </span>
        <span aria-hidden="true" className="groupedListboxCaret">
          ▾
        </span>
      </button>
      {open ? (
        <div className="groupedListboxPanel" role="listbox">
          {groups.map((group) => (
            <div className="groupedListboxGroup" key={group.label}>
              <span className="groupedListboxGroupLabel">{group.label}</span>
              {group.options.map((option) => (
                <button
                  aria-selected={option.value === value}
                  className="groupedListboxOption"
                  key={option.value}
                  onClick={() => select(option)}
                  role="option"
                  type="button"
                >
                  <strong>{option.label}</strong>
                  {option.detail ? (
                    <span className="groupedListboxOptionDetail">{option.detail}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
