import type { CSSProperties } from "react";

type IconProps = {
  className?: string;
  filled?: boolean;
  name: string;
  size?: number;
  weight?: number;
};

type IconStyle = CSSProperties & {
  "--icon-fill": 0 | 1;
  "--icon-size": string;
  "--icon-weight": number;
};

export function Icon({
  className,
  filled = false,
  name,
  size = 20,
  weight = 400,
}: IconProps) {
  const iconClassName = className ? `app-icon ${className}` : "app-icon";
  const iconStyle: IconStyle = {
    "--icon-fill": filled ? 1 : 0,
    "--icon-size": `${size}px`,
    "--icon-weight": weight,
  };

  return (
    <span aria-hidden="true" className={iconClassName} style={iconStyle}>
      {name}
    </span>
  );
}
