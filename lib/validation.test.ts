import { describe, expect, it } from 'vitest';

import {
  clampMinutes,
  formatDuration,
  validateDurationMinutes,
  validateId,
  validateOptionalSkillId,
  validateSessionNote,
  validateSkillName,
} from './validation';

describe('validateSessionNote', () => {
  it('returns null for empty and blank notes', () => {
    expect(validateSessionNote('')).toBeNull();
    expect(validateSessionNote('   ')).toBeNull();
  });

  it('trims and returns a normal note', () => {
    expect(validateSessionNote('  deep work  ')).toBe('deep work');
  });

  it('rejects notes longer than 200 characters', () => {
    expect(() => validateSessionNote('a'.repeat(201))).toThrow();
    expect(validateSessionNote('a'.repeat(200))).toBe('a'.repeat(200));
  });
});

describe('validateId', () => {
  it('trims and returns a valid UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(validateId(`  ${id}  `)).toBe(id);
  });

  it('rejects an empty string', () => {
    expect(() => validateId('')).toThrow('Id must not be empty');
  });

  it('rejects non-UUID garbage', () => {
    expect(() => validateId('not-a-uuid')).toThrow('Id must be a valid UUID');
  });

  it('rejects whitespace-only input', () => {
    expect(() => validateId(' \t\n ')).toThrow('Id must not be empty');
  });

  it('rejects non-string input', () => {
    for (const id of [null, undefined, 123, {}]) {
      expect(() => validateId(id)).toThrow('Id must be a string');
    }
  });
});

describe('validateSkillName', () => {
  it('trims and returns a valid name', () => {
    expect(validateSkillName('  Python  ')).toBe('Python');
  });

  it('rejects empty and overlong names', () => {
    expect(() => validateSkillName('')).toThrow();
    expect(() => validateSkillName('   ')).toThrow();
    expect(() => validateSkillName('a'.repeat(61))).toThrow();
  });
});

describe('validateDurationMinutes', () => {
  it('accepts the boundary values 1 and 480', () => {
    expect(validateDurationMinutes(1)).toBe(1);
    expect(validateDurationMinutes(480)).toBe(480);
  });

  it('rejects non-integers and out-of-range values', () => {
    expect(() => validateDurationMinutes(1.5)).toThrow();
    expect(() => validateDurationMinutes(0)).toThrow();
    expect(() => validateDurationMinutes(481)).toThrow();
  });
});

describe('clampMinutes', () => {
  it('rounds and clamps into 1..480', () => {
    expect(clampMinutes(25.4)).toBe(25);
    expect(clampMinutes(25.6)).toBe(26);
    expect(clampMinutes(-10)).toBe(1);
    expect(clampMinutes(9999)).toBe(480);
  });
});

describe('formatDuration', () => {
  it('formats null, zero and negative input as 0m', () => {
    expect(formatDuration(null)).toBe('0m');
    expect(formatDuration(undefined)).toBe('0m');
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-5)).toBe('0m');
  });

  it('formats minutes and whole hours', () => {
    expect(formatDuration(90)).toBe('1m');
    expect(formatDuration(1500)).toBe('25m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(5400)).toBe('1h 30m');
  });
});

describe('validateOptionalSkillId', () => {
  it.each(['', ' \t\n ', null, undefined])('returns null for an empty selection %j', (value) => {
    expect(validateOptionalSkillId(value)).toBeNull();
  });

  it.each(['not-a-uuid', 123, {}, new Blob(['skill'])])('rejects invalid input %j', (value) => {
    expect(() => validateOptionalSkillId(value)).toThrow();
  });

  it('returns a trimmed valid UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(validateOptionalSkillId(`  ${id}  `)).toBe(id);
  });
});
