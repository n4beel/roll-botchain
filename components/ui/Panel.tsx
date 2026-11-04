import React from "react";

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  heading?: React.ReactNode;
  action?: React.ReactNode;
  framed?: boolean;
}

export function Panel({
  heading,
  action,
  framed = true,
  children,
  className = "",
  ...props
}: PanelProps) {
  return (
    <section
      className={`bg-[var(--bg-surface)] text-[var(--text-primary)] ${
        framed ? "border-2 border-[var(--border-default)] shadow-[3px_3px_0px_var(--text-primary)]" : ""
      } p-5 ${className}`}
      {...props}
    >
      {(heading || action) && (
        <header className="flex items-center justify-between gap-4 pb-3 mb-4 border-b border-[var(--border-subtle)]">
          {heading && <div className="text-lg font-bold font-serif">{heading}</div>}
          {action && <div className="text-sm">{action}</div>}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}

export default Panel;
