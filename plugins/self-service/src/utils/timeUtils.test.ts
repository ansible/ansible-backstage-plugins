import { formatRelativeTime } from './timeUtils';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return "Never synced" for null timestamp', () => {
    expect(formatRelativeTime(null)).toBe('Never synced');
  });

  it('should return "Synced Just Now" for timestamps less than 1 minute ago', () => {
    const timestamp = new Date('2024-01-15T11:59:30Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced Just Now');
  });

  it('should return "Synced a minute ago" for exactly 1 minute ago', () => {
    const timestamp = new Date('2024-01-15T11:59:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced a minute ago');
  });

  it('should return "Synced few minutes ago" for 2-4 minutes ago', () => {
    const timestamp = new Date('2024-01-15T11:57:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced few minutes ago');
  });

  it('should return "Synced 5 minutes ago" for 5+ minutes ago', () => {
    const timestamp = new Date('2024-01-15T11:55:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced 5 minutes ago');
  });

  it('should return "Synced today" for 1 hour ago on same day', () => {
    const timestamp = new Date('2024-01-15T11:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced today');
  });

  it('should return "Synced today" for 3 hours ago on same day', () => {
    const timestamp = new Date('2024-01-15T09:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced today');
  });

  it('should return "Synced today" for 6 hours ago on same day', () => {
    const timestamp = new Date('2024-01-15T06:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced today');
  });

  it('should return "Synced today" for same day', () => {
    const timestamp = new Date('2024-01-15T00:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced today');
  });

  it('should return "Synced yesterday" for 1-2 days ago', () => {
    const timestamp = new Date('2024-01-14T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced yesterday');
  });

  it('should return "Synced few days ago" for 3-4 days ago', () => {
    const timestamp = new Date('2024-01-12T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced few days ago');
  });

  it('should return "Synced 5 days ago" for 5-6 days ago', () => {
    const timestamp = new Date('2024-01-10T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced 5 days ago');
  });

  it('should return "Synced a week ago" for 1-2 weeks ago', () => {
    const timestamp = new Date('2024-01-08T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced a week ago');
  });

  it('should return "Synced last week" for 2-3 weeks ago', () => {
    const timestamp = new Date('2024-01-01T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced last week');
  });

  it('should return "Synced 3 weeks ago" for 3+ weeks ago', () => {
    const timestamp = new Date('2023-12-25T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced 3 weeks ago');
  });

  it('should return "Synced 1 month ago" for approximately 1 month ago', () => {
    const timestamp = new Date('2023-12-15T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced 1 month ago');
  });

  it('should return "Synced 2 months ago" for 2+ months ago', () => {
    const timestamp = new Date('2023-11-15T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced 2 months ago');
  });

  it('should return "Synced 1 year ago" for exactly 1 year ago', () => {
    const timestamp = new Date('2023-01-15T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced 1 year ago');
  });

  it('should return "Synced 2 years ago" for 2 years ago', () => {
    const timestamp = new Date('2022-01-15T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced 2 years ago');
  });

  it('should return "Synced Just Now" for future timestamps', () => {
    const timestamp = new Date('2024-01-15T12:01:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('Synced Just Now');
  });

  it('should return "Invalid timestamp" for invalid timestamp strings', () => {
    expect(formatRelativeTime('invalid-timestamp')).toBe('Invalid timestamp');
  });

  it('should return "Never synced" for empty string', () => {
    expect(formatRelativeTime('')).toBe('Never synced');
  });
});
