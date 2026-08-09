"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DayPicker } from "react-day-picker";
import { createPortal } from "react-dom";
import "react-day-picker/dist/style.css";

// Single-date counterpart to DateRangePicker.tsx (mirrors its popover
// positioning/open-close behavior) — the shared date-only picker every
// date-only field in the app should use instead of a bare native
// `<input type="date">`. Value/onChange use the same "YYYY-MM-DD" string
// format and `{ target: { name, value } }` event shape a native date input
// produces, so it drops into existing `onChange={handleChange}` handlers
// without changing surrounding state logic.
interface DatePickerProps {
  name?: string;
  label?: React.ReactNode;
  value: string; // "YYYY-MM-DD" or ""
  // Typed as a real input ChangeEvent (not a bespoke shape) purely so this
  // drops into the existing `onChange={handleChange}` handlers already
  // written for native `<input type="date">` across the app — internally
  // this only ever sends a minimal { target: { name, value } } object, cast
  // to satisfy the type, since none of those handlers read anything else
  // off the event.
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayFormat(value: string): string {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export default function DatePicker({
  name,
  label,
  value,
  onChange,
  placeholder = "Select date",
  required = false,
  disabled = false,
  min,
  max,
  className = "",
}: DatePickerProps) {
  const selected = value ? new Date(value + "T00:00:00Z") : undefined;
  const minDate = min ? new Date(min + "T00:00:00Z") : undefined;
  const maxDate = max ? new Date(max + "T00:00:00Z") : undefined;

  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    const viewportHeight = window.innerHeight;

    const estimatedHeight = 360;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement = spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? "top" : "bottom";

    const top = placement === "bottom" ? rect.bottom + scrollTop : rect.top + scrollTop - estimatedHeight;
    let left = rect.left + scrollLeft;

    const dropdownWidth = window.innerWidth < 640 ? window.innerWidth - 32 : 320;
    if (left + dropdownWidth > window.innerWidth + scrollLeft) {
      left = window.innerWidth + scrollLeft - dropdownWidth - 8;
    }
    if (left < scrollLeft + 8) left = scrollLeft + 8;

    setDropdownStyle({
      position: "absolute",
      top,
      left,
      minWidth: window.innerWidth < 640 ? `calc(100vw - 32px)` : "320px",
      maxHeight: `calc(100vh - 40px)`,
      overflowY: "auto",
      zIndex: 9999,
    });
  }, []);

  const toggleOpen = useCallback(() => {
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [isOpen, updatePosition, disabled]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isOpen) return;
      const target = event.target as Node;
      const isOutsideButton = containerRef.current && !containerRef.current.contains(target);
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target);
      if (isOutsideButton && isOutsideDropdown) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleReposition = () => updatePosition();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isOpen, updatePosition]);

  const disabledMatcher =
    minDate && maxDate
      ? { before: minDate, after: maxDate }
      : minDate
        ? { before: minDate }
        : maxDate
          ? { after: maxDate }
          : undefined;

  const handleSelect = (date: Date | undefined) => {
    const newValue = date ? formatLocalDate(date) : "";
    onChange({ target: { name, value: newValue } } as unknown as React.ChangeEvent<HTMLInputElement>);
    setIsOpen(false);
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <div className="relative" ref={containerRef}>
        <div
          ref={buttonRef}
          onClick={toggleOpen}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => e.key === "Enter" && toggleOpen()}
          aria-disabled={disabled}
          className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 transition ${
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500"
          }`}
        >
          <span className={value ? "text-slate-900" : "text-slate-400"}>{value ? displayFormat(value) : placeholder}</span>
        </div>
        {isOpen &&
          typeof window !== "undefined" &&
          createPortal(
            <div ref={dropdownRef} style={dropdownStyle} className="bg-white border border-gray-200 rounded-xl shadow-xl p-2 sm:p-3">
              <DayPicker
                mode="single"
                selected={selected}
                onSelect={handleSelect}
                disabled={disabledMatcher}
                showOutsideDays
                fixedWeeks
              />
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}
