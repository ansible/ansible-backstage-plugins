/**
 * Concurrent task registration with whole-batch failure reporting.
 *
 * Every registration is attempted — one failing entry must not silently
 * prevent the rest from being registered — and the batch fails loudly with
 * every failure collected once all attempts have settled.
 */
export async function registerAll(
  registrations: ReadonlyArray<() => Promise<void>>,
): Promise<void> {
  const failures: unknown[] = [];
  await Promise.all(
    registrations.map(async register => {
      try {
        await register();
      } catch (error) {
        failures.push(error);
      }
    }),
  );
  if (failures.length > 0) {
    throw new Error(
      `failed to complete ${failures.length} of ${registrations.length} ` +
        `task registration(s): ${failures.map(String).join('; ')}`,
    );
  }
}
