// True when the browser says this request loads a page inside a frame (HighLevel's custom page).
// Browsers without Sec-Fetch-Dest send nothing, which counts as not framed (the old redirect).
export function isFramedRequest(headers: Pick<Headers, "get">): boolean {
  const dest = headers.get("sec-fetch-dest");
  return dest === "iframe" || dest === "frame";
}
