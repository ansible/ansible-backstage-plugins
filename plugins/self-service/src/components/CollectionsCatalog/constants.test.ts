import {
  COLLECTION_TOOLTIP,
  COLLECTION_DESCRIPTION,
  PAGE_SIZE,
  CONFIGURATION_DOCS_URL,
} from './constants';

describe('CollectionsCatalog constants', () => {
  it('COLLECTION_TOOLTIP is a non-empty string', () => {
    expect(typeof COLLECTION_TOOLTIP).toBe('string');
    expect(COLLECTION_TOOLTIP.length).toBeGreaterThan(0);
    expect(COLLECTION_TOOLTIP).toContain('Ansible Collection');
  });

  it('COLLECTION_DESCRIPTION is a non-empty string', () => {
    expect(typeof COLLECTION_DESCRIPTION).toBe('string');
    expect(COLLECTION_DESCRIPTION.length).toBeGreaterThan(0);
    expect(COLLECTION_DESCRIPTION).toContain('collections');
  });

  it('PAGE_SIZE is a positive number', () => {
    expect(typeof PAGE_SIZE).toBe('number');
    expect(PAGE_SIZE).toBe(12);
  });

  it('CONFIGURATION_DOCS_URL is defined', () => {
    expect(CONFIGURATION_DOCS_URL).toBeDefined();
    expect(typeof CONFIGURATION_DOCS_URL).toBe('string');
  });
});
