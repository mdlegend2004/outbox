import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

/** Filled grey input used on the login card. */
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={clsx(
        "h-11 w-full rounded-lg bg-surface px-4 text-sm text-ink placeholder:text-ink-faint outline-none ring-brand/30 focus:ring-2",
        className,
      )}
      {...rest}
    />
  );
});

/** Small bordered numeric box ("Delay between 2 emails [00]"). */
export const NumberBox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function NumberBox(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      min={0}
      className={clsx(
        "h-8 w-16 rounded-md border border-line bg-white px-2 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-brand",
        className,
      )}
      {...rest}
    />
  );
});

/** Label-left form row with an underline, used across the compose screen. */
export function FieldRow({
  label,
  children,
  underline = true,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  underline?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className={clsx("flex min-h-[44px] items-center gap-4", underline && "border-b border-line")}>
      <label htmlFor={htmlFor} className="w-14 shrink-0 text-sm text-ink">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}
