import type { CSSProperties, ReactNode } from "react";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: "blue" | "purple" | "green" | "red" | "orange";
  size?: "sm" | "md" | "lg";
  width?: string | number;
  height?: string | number;
  customSize?: boolean;
}

const sizeMap = {
  sm: "w-48 h-64",
  md: "w-64 h-80",
  lg: "w-80 h-96"
};

const GlowCard = ({ children, className = "", size = "md", width, height, customSize = false }: GlowCardProps) => {
  const inlineStyles: CSSProperties = {
    width: width !== undefined ? (typeof width === "number" ? `${width}px` : width) : undefined,
    height: height !== undefined ? (typeof height === "number" ? `${height}px` : height) : undefined
  };

  return (
    <div
      style={inlineStyles}
      className={`${customSize ? "" : sizeMap[size]} ${!customSize ? "aspect-[3/4]" : ""} rounded-md border border-border bg-card p-4 ${className}`}
    >
      {children}
    </div>
  );
};

export { GlowCard };