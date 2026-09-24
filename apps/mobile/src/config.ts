const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "https://api-production-dbba.up.railway.app";
const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? "https://web-production-94e63.up.railway.app";

function publicUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("MARKOS mobile requires a public HTTPS service URL without credentials.");
  }
  return url.toString().replace(/\/$/, "");
}

export const config = { apiUrl: publicUrl(apiUrl), webUrl: publicUrl(webUrl) };
export const serviceKey = new URL(config.apiUrl).hostname.replace(/[^a-zA-Z0-9.-]/g, "_");
