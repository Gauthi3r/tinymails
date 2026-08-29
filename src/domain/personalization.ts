import type { ContactInput } from "./types";

export function renderMessage(template: string, contact: ContactInput): string {
  return template
    .replaceAll("{firstName}", contact.firstName?.trim() || "there")
    .replaceAll("{company}", contact.company?.trim() || "your company");
}
