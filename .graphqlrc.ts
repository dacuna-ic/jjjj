import type { IGraphQLConfig } from "graphql-config";

const config: IGraphQLConfig = {
  schema: "node_modules/@octokit/graphql-schema/schema.graphql",
  documents: "./**/*.ts",
  extensions: {
    codegen: {
      overwrite: true,
      emitLegacyCommonJSImports: false,
      generates: {
        "./src/lib/gql/": {
          preset: "client",
          config: {
            useTypeImports: true,
          },
          plugins: [],
        },
      },
    },
  },
};

export default config;
