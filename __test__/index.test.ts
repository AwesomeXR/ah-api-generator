import { generateAPIService, IConfig } from '../src';

describe('generateAPIService', () => {
  const testList: { input: string; invokeArgs: Partial<IConfig> }[] = [
    { input: 'api', invokeArgs: {} },
    { input: 'api2', invokeArgs: { operationIdSplitter: '_' } },
    { input: 'api', invokeArgs: { noMeta: true } },
    { input: 'api', invokeArgs: { noBuiltinService: true } },
    { input: 'api', invokeArgs: { usePrototypeMethod: true } },
  ];

  testList.forEach(({ input, invokeArgs }) => {
    const itName = `${input} - ${JSON.stringify(invokeArgs)}`;

    it(itName, async () => {
      const tsContent = await generateAPIService({
        input: { type: 'local', filename: `${__dirname}/${input}.json` },
        banner: '//banner',
        ...invokeArgs,
      });
      expect(tsContent).toMatchSnapshot(itName);
    });
  });
});
