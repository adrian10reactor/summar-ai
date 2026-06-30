export async function parseApiResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    if (res.status === 413) throw new Error("Payload too large (Vercel 4.5 MB limit). Please re-upload PDFs so they can be sent by reference.");
    throw new Error(text?.slice(0, 200) || `HTTP ${res.status}`);
  }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return body as T;
}
