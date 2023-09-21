import path from 'path';
import fs from 'fs';
import { curl } from 'urllib';
import { renderService } from './util';
import ejs from 'ejs';
import { OpenAPIV3 as API } from 'openapi-types';
import prettier from 'prettier';
import RefParser from '@apidevtools/json-schema-ref-parser';

export * from './util';

export interface IConfig {
  input?: { type: 'local'; filename: string } | { type: 'remote'; url: string; headers?: any };
  operationIdSplitter?: string;
  template?: string;
  banner?: string;
  noMeta?: boolean;
  noBuiltinService?: boolean;
  dump?: string;
}

export const loadApiDoc = async (input: IConfig['input']): Promise<API.Document> => {
  if (!input) throw new Error('input 不存');

  let result =
    input.type === 'local'
      ? JSON.parse(fs.readFileSync(input.filename, { encoding: 'utf-8' }))
      : input.type === 'remote'
      ? await curl<any>(input.url, { headers: input.headers, dataType: 'json' }).then(r => r.data)
      : null;

  if (!result) throw new Error(`inputSource 不存在: ${JSON.stringify(input)}`);

  // 解 $ref
  result = await RefParser.dereference(result);

  return result;
};

export const generateAPIService = async (cfg: IConfig) => {
  const {
    input = { type: 'local', filename: 'api.json' },
    template = path.resolve(__dirname, '..', 'template.ejs'),
    dump,
    noBuiltinService,
    banner,
  } = cfg;

  const apiDoc = await loadApiDoc(input);
  const serviceMap = renderService(apiDoc, { operationIdSplitter: cfg.operationIdSplitter });

  // render template
  let content = ejs.render(fs.readFileSync(template, { encoding: 'utf-8' }), {
    serviceMap,
    extra: { noBuiltinService },
  });

  if (banner) content = banner + '\n' + content;

  // pretty
  const prettierOpt = await prettier.resolveConfig(process.cwd());
  content = prettier.format(content, {
    parser: 'typescript',
    trailingComma: 'es5',
    tabWidth: 2,
    semi: true,
    singleQuote: true,
    jsxSingleQuote: true,
    printWidth: 120,
    bracketSpacing: true,
    arrowParens: 'avoid',
    ...prettierOpt,
  });

  // dump
  if (dump) fs.writeFileSync(dump, content, { encoding: 'utf-8' });

  return content;
};
