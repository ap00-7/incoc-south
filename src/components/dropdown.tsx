import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export type DropdownOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type DropdownProps = {
  id?: string;
  name?: string;
  value: string;
  options: DropdownOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
};

type MenuPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

function nextEnabledIndex(options: DropdownOption[], start: number, direction: 1 | -1) {
  for (let index = start; index >= 0 && index < options.length; index += direction) {
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

export function Dropdown({
  id,
  name,
  value,
  options,
  onValueChange,
  placeholder = "Select an option",
  disabled = false,
  required = false,
  autoFocus = false,
  className = "",
  "aria-label": ariaLabel,
}: DropdownProps) {
  const generatedId = useId();
  const triggerId = id ?? `dropdown-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus();
  }, [autoFocus]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const openAt = useCallback((direction: 1 | -1 = 1) => {
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    const start = selectedIndex >= 0 ? selectedIndex : direction > 0 ? 0 : options.length - 1;
    setActiveIndex(nextEnabledIndex(options, start, direction));
    setOpen(true);
  }, [options, value]);

  const select = useCallback((option: DropdownOption | undefined) => {
    if (!option || option.disabled) return;
    onValueChange(option.value);
    close();
    triggerRef.current?.focus();
  }, [close, onValueChange]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const edge = 8;
      const gap = 6;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(rect.width, Math.max(0, viewportWidth - edge * 2));
      const left = Math.min(Math.max(edge, rect.left), viewportWidth - width - edge);
      const below = viewportHeight - rect.bottom - edge - gap;
      const above = rect.top - edge - gap;
      const openAbove = below < Math.min(220, above) && above > below;
      const availableHeight = Math.max(80, openAbove ? above : below);
      const maxHeight = Math.min(320, availableHeight, viewportHeight - edge * 2);
      const top = openAbove ? Math.max(edge, rect.top - gap - maxHeight) : rect.bottom + gap;
      setPosition({ left, top, width, maxHeight });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close, open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) {
        openAt(direction);
        return;
      }
      const start = activeIndex < 0 ? (direction > 0 ? 0 : options.length - 1) : activeIndex + direction;
      const nextIndex = nextEnabledIndex(options, start, direction);
      if (nextIndex >= 0) setActiveIndex(nextIndex);
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(nextEnabledIndex(options, 0, 1));
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(nextEnabledIndex(options, options.length - 1, -1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) openAt();
      else select(options[activeIndex]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    } else if (event.key === "Tab" && open) {
      close();
    }
  }

  const menu = open && position && createPortal(
    <div
      className="dropdown-menu"
      id={listboxId}
      role="listbox"
      aria-labelledby={triggerId}
      ref={menuRef}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        maxHeight: position.maxHeight,
      }}
    >
      {options.map((option, index) => (
        <button
          type="button"
          id={`${triggerId}-option-${index}`}
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled || undefined}
          className="dropdown-option"
          data-option-index={index}
          data-active={index === activeIndex || undefined}
          key={`${option.value}-${index}`}
          disabled={option.disabled}
          onPointerMove={() => setActiveIndex(index)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => select(option)}
        >
          {option.label}
        </button>
      ))}
    </div>,
    document.body,
  );

  return (
    <div className={`dropdown${className ? ` ${className}` : ""}`} ref={rootRef}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        id={triggerId}
        className="dropdown-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${triggerId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        ref={triggerRef}
        onClick={() => open ? close() : openAt()}
        onKeyDown={onKeyDown}
      >
        <span className="dropdown-value">{selectedOption?.label ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}
