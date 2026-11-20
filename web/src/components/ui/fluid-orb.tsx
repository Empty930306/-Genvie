import { type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import "./fluid-orb.css";

type FluidOrbProps = {
    size?: number;
    color?: string;
    className?: string;
};

export function FluidOrb({ size = 56, color = "#6d5dfc", className }: FluidOrbProps) {
    return (
        <span className={cn("fluid-orb", className)} style={{ width: size, height: size, "--fluid-orb-color": color } as CSSProperties} aria-hidden="true">
            <img src="/huaban-6398074816.gif" alt="" className="fluid-orb-image" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </span>
    );
}
