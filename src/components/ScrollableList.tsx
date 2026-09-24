import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type ScrollableListProps = ComponentProps<"div"> & {
  /** Larger cap for primary panels (e.g. calendar day sessions). */
  size?: "md" | "lg";
};

const sizeClass = {
  md: "max-h-[min(70vh,28rem)]",
  lg: "max-h-[min(75vh,36rem)]",
} as const;

export function ScrollableList({
  className,
  size = "md",
  ...props
}: ScrollableListProps) {
  return (
    <div
      className={cn(
        "overflow-y-auto overscroll-contain",
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
}
