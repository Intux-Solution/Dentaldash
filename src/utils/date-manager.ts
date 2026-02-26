import { startOfDay, endOfDay, addDays, isAfter, addMinutes, isBefore, format, parseISO } from 'date-fns';

/**
 * Parses a YYYY-MM-DD string as a local midnight Date.
 * Avoids UTC shifts from standard new Date('YYYY-MM-DD') which assumes UTC.
 */
export const parseLocalYMD = (s: string | null): Date | null => {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0);
    }
    // Fallback for full ISO strings or unexpected formats
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};

/**
 * Formats a Date to a time string in the Argentina timezone format (HH:mm)
 */
export const formatTimeAR = (date: Date): string => {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
};

/**
 * Validates if the given slot start and end times fall within the given range boundaries.
 */
export const isSlotWithinRange = (slotStart: Date, slotEnd: Date, rangeEnd: Date): boolean => {
    return isBefore(slotStart, rangeEnd) && !isAfter(slotEnd, rangeEnd);
};

export const createLocalMidday = (yStr: string, mStr: string, dStr: string): Date => {
    return new Date(
        parseInt(yStr, 10),
        parseInt(mStr, 10) - 1,
        parseInt(dStr, 10),
        12, 0, 0 // Use noon to avoid any edge flips during day math
    );
};

export const getDayBounds = (date: Date): { start: Date, end: Date } => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
};
