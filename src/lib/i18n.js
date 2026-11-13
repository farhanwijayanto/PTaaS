import { emit } from './events.js';
import { messages } from './messages.js';

let lang = 'en';
try { lang = localStorage.getItem('ptaas.lang') || 'en'; } catch { /* storage unavailable */ }
document.documentElement.lang = lang;

export const getLang = () => lang;

export function setLang(next) {
  lang = next;
  try { localStorage.setItem('ptaas.lang', next); } catch { /* storage unavailable */ }
  document.documentElement.lang = next;
  emit('lang', next);
}

export const toggleLang = () => setLang(lang === 'en' ? 'id' : 'en');

export function t(key, vars) {
  let text = messages[lang]?.[key] ?? messages.en[key] ?? key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
  return text;
}
