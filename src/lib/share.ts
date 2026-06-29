import { Quiz } from "@/types";

export function encodeQuiz(quiz: Quiz): string {
  const json = JSON.stringify(quiz);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeQuiz(encoded: string): Quiz | null {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getShareUrl(quiz: Quiz): string {
  const encoded = encodeQuiz(quiz);
  return `${window.location.origin}/quiz#${encoded}`;
}

export async function copyShareLink(quiz: Quiz): Promise<boolean> {
  try {
    const url = getShareUrl(quiz);
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
