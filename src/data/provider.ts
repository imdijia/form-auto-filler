import type {
  CompositeProvider,
  DataProvider,
  FillContext,
  ProviderRegistry,
} from '../contracts';

export function createCompositeProvider(
  chain: readonly DataProvider[],
): CompositeProvider {
  return {
    id: 'composite',
    chain,
    async getValue(field, ctx: FillContext): Promise<string> {
      for (const provider of chain) {
        const value = await provider.getValue(field, ctx);
        if (typeof value === 'string' && value.length > 0) return value;
      }
      return '';
    },
  };
}

/** v1 registers RandomProvider only. PresetProvider / CsvProvider only need a
    new file + a register() call; detection, fill and execution stay untouched. */
export function createProviderRegistry(fallback: DataProvider): ProviderRegistry {
  const providers: DataProvider[] = [fallback];
  return {
    register(provider: DataProvider): void {
      providers.push(provider);
    },
    resolve(_ctx: FillContext): DataProvider {
      return createCompositeProvider(providers);
    },
  };
}
