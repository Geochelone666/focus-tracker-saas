export const MAX_SESSION_NOTE_LENGTH = 200;
export const MAX_SKILL_NAME_LENGTH = 60;
export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 480;

/**
 * Normalize a focus-session note. Returns null for empty/blank input so the
 * caller can store NULL instead of an empty string.
 */
export function validateSessionNote(note: string): string | null {
  const trimmed = note.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > MAX_SESSION_NOTE_LENGTH) {
    throw new Error(
      `Session note must be at most ${MAX_SESSION_NOTE_LENGTH} characters`,
    );
  }

  return trimmed;
}

/** Normalize an id; rejects empty input and malformed UUIDs. */
export function validateId(id: unknown): string {
  if (typeof id !== 'string') {
    throw new Error('Id must be a string');
  }

  const trimmed = id.trim();

  if (trimmed.length === 0) {
    throw new Error('Id must not be empty');
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    throw new Error('Id must be a valid UUID');
  }

  return trimmed;
}

/** Normalize a skill name; rejects empty and overly long names. */
export function validateSkillName(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new Error('Skill name must not be empty');
  }

  if (trimmed.length > MAX_SKILL_NAME_LENGTH) {
    throw new Error(
      `Skill name must be at most ${MAX_SKILL_NAME_LENGTH} characters`,
    );
  }

  return trimmed;
}

/** Assert a duration is a whole number of minutes within the allowed range. */
export function validateDurationMinutes(minutes: number): number {
  if (!Number.isInteger(minutes)) {
    throw new Error('Duration must be a whole number of minutes');
  }

  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
    throw new Error(
      `Duration must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes`,
    );
  }

  return minutes;
}

/** Round to whole minutes and clamp into the allowed range. */
export function clampMinutes(minutes: number): number {
  const rounded = Math.round(minutes);

  if (rounded < MIN_DURATION_MINUTES) {
    return MIN_DURATION_MINUTES;
  }

  if (rounded > MAX_DURATION_MINUTES) {
    return MAX_DURATION_MINUTES;
  }

  return rounded;
}

/** Format a duration in seconds as "Xm" or "Xh Ym" for display. */
export function formatDuration(
  totalSeconds: number | null | undefined,
): string {
  if (totalSeconds == null || totalSeconds <= 0) {
    return '0m';
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${totalMinutes}m`;
  }

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Blank input clears the preference; otherwise require whole minutes in 1..1440. */
export function validateDailyTargetMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const minutes = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new Error('Daily target must be a whole number between 1 and 1440 minutes');
  }
  return minutes;
}
