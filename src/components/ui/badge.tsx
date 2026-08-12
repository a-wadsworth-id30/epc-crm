import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default:
          "border-transparent bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
        destructive:
          "border-transparent bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300",
        outline:
          "border-gray-200 text-gray-700 dark:border-gray-800 dark:text-gray-300",
        secondary:
          "border-transparent bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
        success:
          "border-transparent bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300",
        warning:
          "border-transparent bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300",
      },
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
