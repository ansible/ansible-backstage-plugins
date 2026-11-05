import { AAPTokenFieldSchema, AAPTokenFieldFieldSchema } from './schema';

describe('AAPTokenFieldSchema', () => {
  it('should be defined', () => {
    expect(AAPTokenFieldSchema).toBeDefined();
  });

  it('should have a schema object', () => {
    expect(AAPTokenFieldSchema.schema).toBeDefined();
  });

  it('AAPTokenFieldFieldSchema should equal AAPTokenFieldSchema.schema', () => {
    expect(AAPTokenFieldFieldSchema).toEqual(AAPTokenFieldSchema.schema);
  });
});
