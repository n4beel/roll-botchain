import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-medium transition-all select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs border",
    md: "px-4 py-2 text-sm border-2",
    lg: "px-6 py-3 text-base border-2",
  }[size];

  const variantClasses = {
    primary:
      "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--border-strong)] hover:brightness-110 active:translate-y-0.5 shadow-[2px_2px_0px_var(--text-primary)]",
    secondary:
      "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-default)] hover:border-[var(--border-strong)] active:translate-y-0.5",
    danger:
      "bg-[var(--danger)] text-white border-[var(--danger)] hover:brightness-110 active:translate-y-0.5",
    ghost:
      "bg-transparent text-[var(--text-primary)] border-transparent hover:bg-[var(--bg-elevated)]",
  }[variant];

  return (
    <button
      className={`${base} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export default Button;
