"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DayPicker, DateRange } from "react-day-picker";
import { createPortal } from "react-dom";
import "react-day-picker/dist/style.css";

interface DateRangePickerProps {
  label: string;
  startDate: Date | null;
  endDate: Date | null;
  onRangeChange: (range: { start: Date | null; end: Date | null }) => void;
  placeholder?: string;
  required?: boolean;
}

export default function DateRangePicker({
  label,
  startDate,
  endDate,
  onRangeChange,
  placeholder = "Select date range",
  required = false,
}: DateRangePickerProps) {
  // Store dates as local-date strings "YYYY-MM-DD"
  const [startDateStr, setStartDateStr] = useState<string | null>(
    startDate ? formatLocalDate(startDate) : null
  );
  const [endDateStr, setEndDateStr] = useState<string | null>(
    endDate ? formatLocalDate(endDate) : null
  );

  // Convert local-date strings to Date objects (UTC midnight) for the picker
  const selectedRange: DateRange | undefined = {
    from: startDateStr ? new Date(startDateStr + "T00:00:00Z") : undefined,
    to: endDateStr ? new Date(endDateStr + "T00:00:00Z") : undefined,
  };

  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Helper: format a Date as YYYY-MM-DD using local date components
  function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Sync internal strings with props (use local getters to avoid timezone shift)
  useEffect(() => {
    setStartDateStr(startDate ? formatLocalDate(startDate) : null);
    setEndDateStr(endDate ? formatLocalDate(endDate) : null);
  }, [startDate, endDate]);

  // Compute dropdown position (unchanged)
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    const viewportHeight = window.innerHeight;

    const estimatedHeight = 400;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement = spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? "top" : "bottom";

    let top = placement === "bottom" ? rect.bottom + scrollTop : rect.top + scrollTop - estimatedHeight;
    let left = rect.left + scrollLeft;

    const dropdownWidth = window.innerWidth < 640 ? window.innerWidth - 32 : 600;
    if (left + dropdownWidth > window.innerWidth + scrollLeft) {
      left = window.innerWidth + scrollLeft - dropdownWidth - 8;
    }
    if (left < scrollLeft + 8) left = scrollLeft + 8;

    setDropdownStyle({
      position: "absolute",
      top: top,
      left: left,
      minWidth: window.innerWidth < 640 ? `calc(100vw - 32px)` : "600px",
      maxWidth: window.innerWidth < 640 ? `calc(100vw - 32px)` : "800px",
      maxHeight: `calc(100vh - 40px)`,
      overflowY: "auto",
      zIndex: 9999,
    });
  }, []);

  const toggleOpen = useCallback(() => {
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [isOpen, updatePosition]);

  // Close on Escape (unchanged)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Click outside (unchanged)
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

  // Reposition on scroll/resize (unchanged)
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

  // Fine‑tune dropdown height after render (unchanged)
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const actualHeight = dropdownRef.current.offsetHeight;
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const placement = dropdownStyle.top === rect.bottom + scrollTop ? "bottom" : "top";

      if (placement === "bottom" && spaceBelow < actualHeight) {
        const newTop = rect.top + scrollTop - actualHeight;
        if (newTop > scrollTop) {
          setDropdownStyle(prev => ({ ...prev, top: newTop }));
        } else {
          if (dropdownRef.current) {
            dropdownRef.current.style.maxHeight = `${spaceBelow - 10}px`;
            dropdownRef.current.style.overflowY = "auto";
          }
        }
      } else if (placement === "top") {
        const newTop = rect.top + scrollTop - actualHeight;
        if (newTop < scrollTop) {
          setDropdownStyle(prev => ({ ...prev, top: rect.bottom + scrollTop }));
          if (dropdownRef.current) {
            dropdownRef.current.style.maxHeight = `${viewportHeight - rect.bottom - 10}px`;
            dropdownRef.current.style.overflowY = "auto";
          }
        }
      }
    }
  }, [isOpen, dropdownStyle.top]);

  // ✅ FIXED: use local getters to build the date string
  const handleSelect = (range: DateRange | undefined) => {
    const newStart = range?.from ? formatLocalDate(range.from) : null;
    const newEnd = range?.to ? formatLocalDate(range.to) : null;

    setStartDateStr(newStart);
    setEndDateStr(newEnd);

    // Call parent with Date objects set to UTC midnight
    onRangeChange({
      start: newStart ? new Date(newStart + "T00:00:00Z") : null,
      end: newEnd ? new Date(newEnd + "T00:00:00Z") : null,
    });
  };

  // Display text (manual formatting from local-date string)
  const displayText = () => {
    if (startDateStr && endDateStr) {
      const [sY, sM, sD] = startDateStr.split("-");
      const [eY, eM, eD] = endDateStr.split("-");
      return `${sD}/${sM}/${sY} – ${eD}/${eM}/${eY}`;
    }
    if (startDateStr) {
      const [sY, sM, sD] = startDateStr.split("-");
      return `From ${sD}/${sM}/${sY}`;
    }
    return placeholder;
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div
        ref={buttonRef}
        className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 cursor-pointer px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
        onClick={toggleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && toggleOpen()}
      >
        <span
          className={
            !startDateStr && !endDateStr
              ? "text-gray-400"
              : "text-gray-900"
          }
        >
          {displayText()}
        </span>
      </div>
      {isOpen &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="bg-white border border-gray-200 rounded-xl shadow-xl"
          >
            <style>
              {`
                .dark .rdp {
                  background-color: #1a1a2e;
                  color: white;
                }
                .dark .rdp-caption_label {
                  color: white !important;
                }
                .dark .rdp-head_cell {
                  color: #a5f0fb !important;
                }
                .dark .rdp-nav_button {
                  color: white !important;
                }
                .dark .rdp-nav_button:hover {
                  background-color: rgba(255,255,255,0.1) !important;
                }
                .dark .rdp-day {
                  color: #e2e8f0 !important;
                }
                .dark .rdp-day_outside {
                  color: #64748b !important;
                }
                .dark .rdp-day_disabled {
                  color: #4b5563 !important;
                }
                .dark .rdp-day_selected,
                .dark .rdp-day_range_start,
                .dark .rdp-day_range_end {
                  background-color: #06b6d4 !important;
                  color: white !important;
                }
                .dark .rdp-day_range_middle {
                  background-color: rgba(6,182,212,0.2) !important;
                }
                .dark .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
                  background-color: rgba(255,255,255,0.08) !important;
                }
                .dark .rdp-day_today {
                  font-weight: bold;
                  border: 1px solid #06b6d4;
                }
                @media (max-width: 640px) {
                  .rdp {
                    font-size: 14px;
                  }
                  .rdp-month {
                    width: 100%;
                  }
                  .rdp-table {
                    width: 100%;
                  }
                  .rdp-cell {
                    padding: 0.2rem;
                  }
                }
              `}
            </style>
            <div className="p-2 sm:p-3">
              <DayPicker
                mode="range"
                selected={selectedRange}
                onSelect={handleSelect}
                numberOfMonths={typeof window !== "undefined" && window.innerWidth < 640 ? 1 : 2}
                showOutsideDays
                fixedWeeks
              />
            </div>
            <div className="sticky bottom-0 bg-inherit border-t border-gray-200 p-2 flex justify-end">
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
  );
}