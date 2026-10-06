import { customAlphabet } from "nanoid";

const alpha = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

export const newId = (prefix: "prj" | "run" | "ast" | "led" | "shr") => `${prefix}_${alpha()}`;
export const shareToken = () => customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 22)();
