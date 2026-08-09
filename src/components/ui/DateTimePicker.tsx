"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DayPicker } from "react-day-picker";
import { createPortal } from "react-dom";
import "react-day-picker/dist/style.css";

// Date+time counterpart to DatePicker.tsx — the shared picker every field
// needing both a date and a time should use instead of a bare native
// `<input type="datetime-local">`. Value/onChange use the same
// "YYYY-MM-DDTHH:mm" string format and `{ target: { name, value } }` event
// shape a native datetime-local input produces, so it drops into existing
// `onChange={handleChange}` handlers without changing surrounding state
// logic.
interface DateTimePickerProps {
  name?: string;
  label?: React.ReactNode;
  value: string; // "YYYY-MM-DDTHH:mm" or ""
  // See DatePicker.tsx's identical comment - typed as a real ChangeEvent
  // purely for drop-in compatibility with existing handleChange handlers.
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayFormat(datePart: string, timePart: string): string {
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}${timePart ? `, ${timePart}` : ""}`;
}

export default function DateTimePicker({
  name,
  label,
  value,
  onChange,
  placeholder = "Select date & time",
  required = false,
  disabled = false,
  className = "",
}: DateTimePickerProps) {
  const [datePart, timePart = "00:00"] = value ? value.split("T") : ["", ""];
  const selected = datePart ? new Date(datePart + "T00:00:00Z") : undefined;

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

    const estimatedHeight = 420;
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

  const emit = (newDatePart: string, newTimePart: string) => {
    onChange(
      { target: { name, value: newDatePart ? `${newDatePart}T${newTimePart || "00:00"}` : "" } } as unknown as React.ChangeEvent<HTMLInputElement>
    );
  };

  const handleDaySelect = (date: Date | undefined) => {
    emit(date ? formatLocalDate(date) : "", timePart);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    emit(datePart, e.target.value);
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
          <span className={datePart ? "text-slate-900" : "text-slate-400"}>
            {datePart ? displayFormat(datePart, timePart) : placeholder}
          </span>
        </div>
        {isOpen &&
          typeof window !== "undefined" &&
          createPortal(
            <div ref={dropdownRef} style={dropdownStyle} className="bg-white border border-gray-200 rounded-xl shadow-xl">
              <div className="p-2 sm:p-3">
                <DayPicker mode="single" selected={selected} onSelect={handleDaySelect} showOutsideDays fixedWeeks />
              </div>
              <div className="sticky bottom-0 bg-white border-t border-gray-200 p-3 flex items-center justify-between gap-3">
                <input
                  type="time"
                  value={timePart}
                  onChange={handleTimeChange}
                  disabled={!datePart}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 [color-scheme:light]"
                />
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Done
                </button>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}
