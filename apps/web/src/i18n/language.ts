
export type Language = 'en' | 'zh-CN';
const key = 'hyperhive.language';
let messages: Readonly<Record<string, string>> | undefined;
let revision = 0;
const subscribers = new Set<() => void>();
function readLanguage(): Language {
  try { return localStorage.getItem(key) === 'zh-CN' ? 'zh-CN' : 'en'; }
  catch { return 'en'; }
}

let current: Language = 'en';
export const getLanguage = () => current;
export function subscribeLanguage(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}
async function apply(language: Language) {
  const request = ++revision;
  if (language === 'zh-CN' && !messages) messages = (await import('./zh-CN.json')).default;
  if (request !== revision) return;
  current = language;
  document.documentElement.lang = language;
  for (const listener of subscribers) listener();
}
export function setLanguage(language: Language) {
  try { localStorage.setItem(key, language); } catch { /* The current tab still works. */ }
  return apply(language);
}
export function initializeLanguage() {
  window.addEventListener('storage', event => {
    if ((event.key === key || event.key === null) && event.storageArea === window.localStorage) void apply(readLanguage());
  });
  return apply(readLanguage());
}

/** Translate display copy. Missing entries retain the original text, including its whitespace. */
export function uiText<T>(value: T): T {
  if (!messages || current === 'en' || typeof value !== 'string') return value;
  const key = value.trim().replace(/\s+/g, ' ');
  if (!Object.hasOwn(messages, key)) return value;
  const translated = messages[key];
  return value.replace(/\S[\s\S]*\S|\S/, () => translated) as T;
}
