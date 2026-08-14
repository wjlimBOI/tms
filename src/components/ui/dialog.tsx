"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      // No backdrop-blur here - blurring a busy grid/table background (like
      // the tenders list) through a semi-transparent overlay can produce a
      // visible moire/crosshatch interference pattern on some GPUs, which
      // is what showed up as stray "crosshair" lines across the Register
      // Interest confirm dialog. A plain dim overlay avoids the artifact
      // entirely and is the same treatment used elsewhere in the app.
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/20 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // A single non-responsive max-w-* (mobile-safe-inset AND the
          // 384px desktop cap folded into one min() expression) instead of
          // the previous "max-w-[calc(100%-2rem)] ... sm:max-w-sm" pair - a
          // bare "sm:max-w-sm" always wins over a caller's own unprefixed
          // max-w-* override at >=640px (later media-query rule in the
          // generated stylesheet beats an earlier unconditional one),
          // silently shrinking any dialog that tries to be wider than the
          // default back down to 384px regardless of what's passed in.
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[min(calc(100%_-_2rem),24rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      // Plain button row, no separate "bar" treatment (previously
      // -mx-4 -mb-4 ... border-t bg-muted/50 rounded-b-xl, which visually
      // read as a second, oddly-offset panel bolted onto the bottom of the
      // dialog rather than part of the same card). No extra top padding
      // here - the parent Popup's own gap-4 between grid rows already
      // spaces this from the content above; adding more on top of that
      // was what pushed the buttons unnaturally far down.
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      // Previously included "*:[a]:underline *:[a]:underline-offset-3
      // *:[a]:hover:text-foreground" - the "*:" child-selector variant is a
      // Tailwind v4 feature and doesn't exist in this project's Tailwind
      // v3.4, so it silently generated no CSS. Dropped as dead code; link
      // styling inside descriptions (rare) can be set per-usage instead.
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
