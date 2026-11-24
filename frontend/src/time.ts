/** Dates and times in the dashboard's language and clock. */

import { TIME } from "./constants";
import type { HomeAssistant } from "./types";

// Home Assistant keeps the clock apart from the language: the profile can be
// English and still ask for 19:00. hass.locale.time_format is "24", "12",
// "language" (whatever that language does) or "system" (whatever the browser
// does, which is what an undefined locale falls back to).
export function localeOf(hass: HomeAssistant | undefined): string | undefined {
  const locale = hass?.locale;
  if (locale?.time_format === "system") return undefined;
  return locale?.language || "sv-SE";
}

// On the day itself "Wednesday" is worse than "Today", and the word differs by
// language. Intl knows it in every language the dashboard can be set to, so the
// card never has to carry a translation of its own.
export function relativeDay(date: Date, locale: string | undefined): string | null {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Whole calendar days apart, so an evening game is still "today" at 08:00
  // and the rounding absorbs a 23 or 25 hour day over a clock change.
  const days = Math.round((midnight(date).getTime() - midnight(new Date()).getTime()) / 86400000);
  if (days !== 0 && days !== 1) return null;
  try {
    const text = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day");
    return text.charAt(0).toUpperCase() + text.slice(1);
  } catch (err) {
    return null;
  }
}

export function timeFormat(hass: HomeAssistant | undefined): Intl.DateTimeFormatOptions {
  switch (hass?.locale?.time_format) {
    // h23 rather than hour12:false - that spells midnight "24:00".
    case "24":
      return { ...TIME, hourCycle: "h23" };
    case "12":
      return { ...TIME, hour12: true };
    default:
      return TIME;
  }
}

/** "Today", "Tomorrow", "Yesterday" - or the weekday and date further out -
 *  for the day `offset` days from today, as `date` is. */
export function dayTitle(date: Date, offset: number, locale: string | undefined): string {
  if (Math.abs(offset) <= 1) {
    try {
      const text = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(offset, "day");
      return text.charAt(0).toUpperCase() + text.slice(1);
    } catch (err) {
      // Fall through to the date.
    }
  }
  const text = date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** When a piece of news came out: "Idag 14:05", "Igår 20:34", else the
 *  date, "18 okt" - a reader wants the latest at a glance, not the clock of
 *  something a week old. */
export function newsWhen(
  value: unknown,
  locale: string | undefined,
  time: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(date) - midnight(new Date())) / 86400000);
  const clock = date.toLocaleTimeString(locale, time);
  if (days === 0) return `Idag ${clock}`;
  if (days === -1) return `Igår ${clock}`;
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}
