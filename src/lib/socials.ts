export type SocialNetwork = "x" | "linkedin" | "instagram";

export const SOCIAL_URLS: Partial<Record<SocialNetwork, string>> = {
  x: process.env.NEXT_PUBLIC_SOCIAL_X_URL,
  linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN_URL,
  instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL,
};
