export type NewsLanguage = 'nl' | 'en';

export function isNewsLanguage(value: unknown): value is NewsLanguage {
  return value === 'nl' || value === 'en';
}

// The existing published News and Poll content is Dutch. Editors can choose
// English for other content without changing the language of the site controls.
export function newsLanguage(value: unknown): NewsLanguage {
  return isNewsLanguage(value) ? value : 'nl';
}
