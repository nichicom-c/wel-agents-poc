import type { ReactNode } from "react";

import { Icon } from "../../shared/ui/Icon.tsx";

type Tone = "danger" | "default" | "success" | "warning";

type EnvironmentSectionProps = {
  children: ReactNode;
  title: string;
};

type EnvironmentRowProps = {
  actionLabel?: string;
  isCode?: boolean;
  label: string;
  onClick?: () => void;
  tone?: Tone;
  value: string;
};

export function EnvironmentSection({
  children,
  title,
}: EnvironmentSectionProps) {
  return (
    <section className="environment-section">
      <h3>{title}</h3>
      <div className="environment-row-group">{children}</div>
    </section>
  );
}

export function EnvironmentRow({
  actionLabel,
  isCode = false,
  label,
  onClick,
  tone = "default",
  value,
}: EnvironmentRowProps) {
  const valueNode = (
    <span
      className={`environment-row-value${
        isCode ? " environment-row-code" : ""
      }`}
    >
      <span className="environment-row-value-text">{value}</span>
      {onClick ? (
        <Icon
          className="environment-row-action-icon"
          name="open_in_new"
          size={16}
        />
      ) : null}
    </span>
  );

  if (onClick) {
    return (
      <button
        className="environment-row environment-row-button"
        type="button"
        data-tone={tone}
        aria-label={actionLabel ?? `${label} を開く`}
        title={actionLabel ?? `${label} を開く`}
        onClick={onClick}
      >
        <span className="environment-row-label">{label}</span>
        {valueNode}
      </button>
    );
  }

  return (
    <div className="environment-row" data-tone={tone}>
      <span className="environment-row-label">{label}</span>
      {valueNode}
    </div>
  );
}
