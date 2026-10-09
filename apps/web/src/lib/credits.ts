import { platformCredits } from "@fashion/core/tools";

/**
 * Credits on screen, in Canopy's unit (one credit is a dollar), so a balance
 * and a cost read the same here as in Canopy: 6 tool credits is "0.18".
 */
export const showCredits = (toolCredits: number, unlimited?: boolean) => (unlimited ? "Unlimited" : platformCredits(toolCredits));
