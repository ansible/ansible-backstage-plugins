import { scrollExpandedSidebarGroupIntoView } from './ContentExpandableSidebarGroup';

describe('scrollExpandedSidebarGroupIntoView', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('scrolls immediately and again after collapse animation', () => {
    const scrollIntoView = jest.fn();
    const element = { scrollIntoView } as unknown as HTMLElement;

    scrollExpandedSidebarGroupIntoView(element);

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'end',
      inline: 'nearest',
      behavior: 'smooth',
    });

    jest.advanceTimersByTime(350);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('no-ops when element is missing', () => {
    expect(() => scrollExpandedSidebarGroupIntoView(null)).not.toThrow();
  });
});
