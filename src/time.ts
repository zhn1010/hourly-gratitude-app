export interface LocalDateTime {
  date: string;
  hour: number;
  minute: number;
}

export interface ScheduledAction {
  kind: "nudge" | "poster" | "none";
  local: LocalDateTime;
}

export function getBerlinLocalParts(date: Date): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const part = (type: string): string => {
    const value = parts.find((item) => item.type === type)?.value;
    if (!value) {
      throw new Error(`Missing ${type} in Berlin date formatting`);
    }
    return value;
  };

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
    minute: Number(part("minute"))
  };
}

export function isActiveGratitudeHour(hour: number): boolean {
  return hour >= 8 && hour <= 21;
}

export function isNudgeMinute(minute: number): boolean {
  return minute === 50 || minute === 55 || minute === 58;
}

export function getScheduledAction(date: Date): ScheduledAction {
  const local = getBerlinLocalParts(date);

  if (isActiveGratitudeHour(local.hour) && isNudgeMinute(local.minute)) {
    return { kind: "nudge", local };
  }

  if (local.hour === 22 && local.minute === 0) {
    return { kind: "poster", local };
  }

  return { kind: "none", local };
}

export function toIsoFromTelegramDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}
