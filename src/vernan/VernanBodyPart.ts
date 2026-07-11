/** Vernan body layers in back-to-front draw order (Java VernanBodyPart). */
export const VERNAN_BODY_PARTS = [
  "base",
  "legs",
  "arm",
  "hair",
  "hat-hair",
  "face",
] as const;

export type VernanBodyPart = (typeof VERNAN_BODY_PARTS)[number];

export function vernanBodyPartFromToken(token: string): VernanBodyPart | null {
  return (VERNAN_BODY_PARTS as readonly string[]).includes(token)
    ? (token as VernanBodyPart)
    : null;
}
