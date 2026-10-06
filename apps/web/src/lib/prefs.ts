import type { Tool } from "@fashion/core/tools";
import type { ProjectPrefs } from "./api";

/**
 * A tool's effective resolution/aspect: what the user picked for this tool, else the project's
 * preference (when the tool supports it), else the tool's default.
 */
export function toolSettings(tool: Pick<Tool, "media" | "resolutions" | "aspects" | "defaultAspect">, ts: { resolution?: string; aspect?: string } | undefined, prefs?: ProjectPrefs) {
  const prefRes = tool.media === "video" ? prefs?.videoResolution : prefs?.imageResolution;
  const resolution = ts?.resolution ?? (prefRes && tool.resolutions.includes(prefRes) ? prefRes : tool.resolutions[0]);
  const aspect = ts?.aspect ?? (prefs?.aspect && tool.aspects.includes(prefs.aspect) ? prefs.aspect : tool.defaultAspect);
  return { resolution, aspect };
}
