import { type CSSProperties } from "react";

import { useAppearanceStore } from "@/stores/use-appearance-store";
import { cn } from "@/lib/utils";
import "./fluid-orb.css";

type FluidOrbProps = {
    size?: number;
    color?: string;
    className?: string;
    customUrl?: string;
};

export function FluidOrb({ size = 56, color = "#6d5dfc", className, customUrl }: FluidOrbProps) {
    const appearance = useAppearanceStore((state) => state.appearance);
    const orbSrc = customUrl || appearance.canvas?.avatarOrbUrl || "/huaban-6398074816.gif";

    return (
        <span className={cn("fluid-orb", className)} style={{ width: size, height: size, "--fluid-orb-color": color } as CSSProperties} aria-hidden="true">
            <img src={orbSrc} alt="" className="fluid-orb-image" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </span>
    );
}
