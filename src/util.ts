import { OpenAPIV3 as API } from 'openapi-types';
import _ from 'lodash';
import { Schema, merge as mergeSchema, SchemaObject, isSchemaObject, createTsTypeLiteral } from 'ah-api-type';
import { inspect } from 'util';

export const log = (...args: any[]) => {
  console.log(...args.map(arg => inspect(arg, { showHidden: false, depth: null })));
};

export function parseRequestSchema(
  method: string,
  data:
    | API.PathItemObject['get']
    | API.PathItemObject['put']
    | API.PathItemObject['post']
    | API.PathItemObject['delete']
): Schema | undefined {
  if (!data) return;

  const schema: Schema = {
    type: 'object',
    properties: {},
  };

  if (data.parameters) {
    (data.parameters as API.ParameterObject[]).forEach(p => {
      Object.assign(schema.properties!, { [p.name]: p.schema });
      if (p.required) {
        if (!schema.required) schema.required = [];
        schema.required!.push(p.name);
      }
    });
  }

  if (data.requestBody) {
    const requestBodyContentJson = (data.requestBody as API.RequestBodyObject).content['application/json'];

    if (typeof (requestBodyContentJson?.schema as any)?.type !== 'undefined') {
      const jSchema = requestBodyContentJson?.schema as Schema;

      if (isSchemaObject(jSchema)) mergeSchema<SchemaObject>(schema, jSchema);
      else throw new Error(`invalid request(${method}) schema type`);
    }
  }

  // 没有收集到，返回空
  if (_.isEmpty(schema.properties)) return;

  return schema;
}

export function parseResponseSchema(
  data:
    | API.PathItemObject['get']
    | API.PathItemObject['put']
    | API.PathItemObject['post']
    | API.PathItemObject['delete']
): Schema | undefined {
  const response = data?.responses?.['200'] as API.ResponseObject;
  const jsonResponse = response.content?.['application/json'];

  if (jsonResponse) {
    // 尝试取 schema
    if (jsonResponse.schema) return jsonResponse.schema as Schema;

    const example = jsonResponse.example || (jsonResponse.examples && Object.values(jsonResponse.examples).pop());

    // 尝试转换 example
    if (example) return data2Schema(example);
  }
}

export type IRequestMeta = {
  query?: {
    schema: Schema;
    tsTypeLiteral: string;
  };
  response?: {
    schema: Schema;
    tsTypeLiteral: string;
  };
  pathName: string;
  method: string;
  description?: string;
  tags?: string[];
  apiDoc?:
    | API.PathItemObject['get']
    | API.PathItemObject['put']
    | API.PathItemObject['post']
    | API.PathItemObject['delete'];
};

export interface IServiceMap {
  [serviceName: string]: {
    [requestName: string]: IRequestMeta;
  };
}

export function renderService(apiDoc: API.Document, opt: { operationIdSplitter?: string } = {}) {
  const serviceMap: IServiceMap = {};
  const { operationIdSplitter = '.' } = opt;

  Object.entries(apiDoc.paths).forEach(([pathName, pi]) => {
    if (!pi) return;

    Object.entries({
      GET: pi.get,
      PUT: pi.put,
      POST: pi.post,
      DELETE: pi.delete,
    }).forEach(([method, commonPiData]) => {
      if (!commonPiData) return;

      let [serviceName, requestName] = (
        commonPiData.operationId || `default${operationIdSplitter}${_.camelCase(pathName)}`
      ).split(operationIdSplitter);

      serviceName = _.capitalize(serviceName);

      const requestSchema = parseRequestSchema(method, commonPiData);
      const respSchema = parseResponseSchema(commonPiData);

      const requestMeta: IRequestMeta = {
        query: requestSchema ? { schema: requestSchema, tsTypeLiteral: createTsTypeLiteral(requestSchema) } : undefined,
        response: respSchema ? { schema: respSchema, tsTypeLiteral: createTsTypeLiteral(respSchema) } : undefined,
        method,
        pathName,
        description: commonPiData.description,
        tags: commonPiData.tags,
        apiDoc: commonPiData,
      };

      //
      _.set(serviceMap, [serviceName, requestName], requestMeta);
    });
  });

  return serviceMap;
}

/** 从数据结构猜测 schema */
export function data2Schema(data: any): Schema {
  if (_.isString(data)) return { type: 'string' };
  if (_.isInteger(data)) return { type: 'integer' };
  if (_.isNumber(data)) return { type: 'number' };

  if (_.isBoolean(data)) return { type: 'boolean' };

  if (_.isArray(data)) {
    return {
      type: 'array',
      items: data2Schema(data[0]),
    };
  }

  if (_.isPlainObject(data)) {
    return {
      type: 'object',
      properties: _.mapValues(data, data2Schema),
      required: Object.keys(data),
    };
  }

  return { type: 'object' };
}
