import * as React from "react";

import { cn } from "@/lib/utils";

const Accordion = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("w-full space-y-2", className)} {...props} />
  )
);
Accordion.displayName = "Accordion";

const AccordionItem = React.forwardRef<
  HTMLDetailsElement,
  React.DetailsHTMLAttributes<HTMLDetailsElement>
>(({ className, ...props }, ref) => (
  <details
    ref={ref}
    className={cn("group rounded-md border border-border bg-card text-card-foreground", className)}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, children, ...props }, ref) => (
  <summary
    ref={ref}
    className={cn(
      "flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden",
      className
    )}
    {...props}
  >
    <span>{children}</span>
    <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">
      v
    </span>
  </summary>
));
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-4 pb-4 text-sm text-muted-foreground", className)} {...props} />
));
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
