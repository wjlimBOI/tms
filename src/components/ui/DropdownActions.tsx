"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Shared kebab/actions-menu pattern: portals its content onto document.body
// so it can escape clipped/scrollable table containers, and positions
// itself against the trigger's bounding rect, flipping above when there
// isn't room below. Originally local to src/app/tenders/page.tsx.
export function DropdownActions({
  children,
  trigger,
}: {
  // Render-prop so each action inside can call `close()` itself as part of
  // its own click handler (a normal setState call within a normal React
  // click handler - the same mechanism every other bit of state in this
  // menu already uses successfully), instead of guessing at a generic
  // "close on any click" rule from outside that can race with the action's
  // own handler.
  children: (close: () => void) => React.ReactNode;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  // The dropdown content is rendered via a portal straight onto
  // document.body, outside triggerRef's own DOM subtree - so a click on any
  // item *inside* the menu was being treated as an "outside" click, closing
  // the menu on mousedown and unmounting the very button/link being clicked
  // before its click handler (which fires after mousedown) ever ran. Every
  // action in this menu - View Details, Register Interest, Edit Dates, etc -
  // silently did nothing because of this. Tracking the portaled menu's own
  // ref too fixes it.
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [dropdownWidth, setDropdownWidth] = useState(224);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      // Responsive dropdown width
      let width = 224;
      if (viewportWidth < 640) width = 200;
      if (viewportWidth < 400) width = 180;
      setDropdownWidth(width);

      // Calculate position to keep dropdown in viewport
      let left = rect.right - width;
      if (left < 10) left = 10;
      if (left + width > viewportWidth - 10) left = viewportWidth - width - 10;

      // The menu is `position: fixed`, so its coordinates are viewport-relative
      // like getBoundingClientRect() already is — adding window.scrollY here
      // would double-count scroll and push the menu off-screen on any page
      // taller than one viewport.
      let top = rect.bottom;
      // If dropdown would go below viewport, position it above
      if (top + 200 > window.innerHeight) {
        top = rect.top - 200;
      }

      setPosition({
        top: top,
        left: left,
      });
    }
  }, [open]);

  return (
    <div className="relative" ref={triggerRef}>
      <div onClick={() => setOpen(!open)} className="cursor-pointer">
        {trigger}
      </div>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[999] bg-white rounded-lg shadow-lg border border-slate-200 py-1 max-h-[300px] overflow-y-auto"
            style={{
              top: position.top,
              left: position.left,
              width: dropdownWidth,
              maxWidth: 'calc(100vw - 20px)'
            }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body
        )}
    </div>
  );
}
