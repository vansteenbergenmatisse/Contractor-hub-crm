import type { LatLng } from "../types";

const EARTH_RADIUS_MILES = 3958.8;
const PAIR = /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

// A job's address is free text and nothing here geocodes it (that would send customer addresses to
// another service). Only an address typed as "lat, lng" gives a point to measure to.
export function parseCoordinates(address: string | null): LatLng | null {
  const match = address?.match(PAIR);
  if (!match) return null;
  const [lat, lng] = [Number(match[1]), Number(match[2])];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// Great-circle distance. Driving distance is longer.
export function distanceMiles(from: LatLng, to: LatLng): number {
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceLabel(miles: number): string {
  const suffix = "mi in a straight line (approximate)";
  if (miles < 0.1) return `Less than 0.1 ${suffix}`;
  return `About ${miles < 10 ? miles.toFixed(1) : Math.round(miles)} ${suffix}`;
}
