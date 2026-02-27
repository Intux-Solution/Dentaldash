import { isAfter, isBefore } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const AR_TZ = 'America/Argentina/Buenos_Aires';

/**
 * Parses a YYYY-MM-DD string as a local midnight Date in Argentina Time.
 * Avoids UTC shifts from standard new Date('YYYY-MM-DD') which assumes UTC.
 */
export const parseLocalYMD = (s: string | null): Date | null => {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        // Argentina is always UTC-3
        const dateStr = `${m[1]}-${m[2]}-${m[3]}T00:00:00.000-03:00`;
        return new Date(dateStr);
    }
    // Fallback for full ISO strings or unexpected formats
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};

/**
 * Formats a Date to a time string in the Argentina timezone format (HH:mm)
 */
export const formatTimeAR = (date: Date): string => {
    return formatInTimeZone(date, AR_TZ, 'HH:mm');
};

/**
 * Validates if the given slot start and end times fall within the given range boundaries.
 */
export const isSlotWithinRange = (slotStart: Date, slotEnd: Date, rangeEnd: Date): boolean => {
    return isBefore(slotStart, rangeEnd) && !isAfter(slotEnd, rangeEnd);
};

/**
 * Creates a Date at exactly midday (12:00:00) in Argentina timezone.
 */
export const createLocalMidday = (yStr: string, mStr: string, dStr: string): Date => {
    const isoStr = `${yStr}-${mStr.padStart(2, '0')}-${dStr.padStart(2, '0')}T12:00:00.000-03:00`;
    return new Date(isoStr);
};

/**
 * Bounds of a given day, strict to Argentina timezone
 */
export const getDayBounds = (date: Date): { start: Date, end: Date } => {
    const arDateStr = formatInTimeZone(date, AR_TZ, 'yyyy-MM-dd');
    const start = new Date(`${arDateStr}T00:00:00.000-03:00`);
    const end = new Date(`${arDateStr}T23:59:59.999-03:00`);
    return { start, end };
};
