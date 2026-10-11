// Server-only access to secrets. Never import this from a client component.
// Never log or return the token itself.

export interface GhlEnv {
  token: string;
  locationId: string;
}

export function getEnv(): GhlEnv {
  const token = process.env.GHL_PRIVATE_TOKEN?.trim();
  const locationId = process.env.GHL_LOCATION_ID?.trim();
  if (!token) throw new Error("GHL_PRIVATE_TOKEN is not set in .env");
  if (!locationId) throw new Error("GHL_LOCATION_ID is not set in .env");
  return { token, locationId };
}

/** Safe to display: confirms the token exists without revealing it. */
export function describeEnv(): { tokenLength: number; locationId: string } {
  const { token, locationId } = getEnv();
  return { tokenLength: token.length, locationId };
}
