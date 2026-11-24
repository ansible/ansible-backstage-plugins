import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const plugins = path.resolve(__dirname, '../..');
const legacy = '@ansible/backstage-rhaap-common';
// The merged catalog split retains this temporary catalog-specific surface.
const temporaryCatalogConsumers = new Set([
  'catalog-backend-module-rhaap',
  'catalog-backend-module-aap',
]);
const temporaryCatalogExports = new Set([
  'createCatalogModule',
  'createRouter',
  'CatalogModuleSlice',
  'resetCatalogModuleSliceGuardForTests',
]);
const ignored = new Set([
  'node_modules',
  'dist',
  'dist-dynamic',
  'dist-types',
  'coverage',
  'build',
]);

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

it('keeps AAP clients and contracts on split packages and limits legacy edges to catalog compatibility', () => {
  const violations: string[] = [];
  for (const entry of fs.readdirSync(plugins, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'backstage-rhaap-common')
      continue;
    const folder = path.join(plugins, entry.name);
    if (!fs.existsSync(path.join(folder, 'package.json'))) continue;
    const manifest = JSON.parse(
      fs.readFileSync(path.join(folder, 'package.json'), 'utf8'),
    );
    const catalogConsumer = temporaryCatalogConsumers.has(entry.name);
    if (!catalogConsumer) {
      for (const section of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ]) {
        if (manifest[section]?.[legacy])
          violations.push(`${entry.name}: ${section} depends on legacy common`);
        if (
          entry.name === 'aap-node' &&
          manifest[section]?.['@ansible/aap-backend']
        ) {
          violations.push(
            `${entry.name}: ${section} depends on backend registration`,
          );
        }
      }
      if (
        Object.values(manifest.scripts ?? {}).some(value =>
          String(value).includes(legacy),
        )
      ) {
        violations.push(`${entry.name}: build script depends on legacy common`);
      }
    }
    for (const file of sourceFiles(folder)) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const report = () => violations.push(path.relative(plugins, file));
      const isLegacy = (node: ts.Node | undefined): node is ts.StringLiteral =>
        !!node &&
        ts.isStringLiteral(node) &&
        (node.text === legacy || node.text.startsWith(`${legacy}/`));
      const isBackend = (node: ts.Node | undefined): node is ts.StringLiteral =>
        !!node &&
        ts.isStringLiteral(node) &&
        (node.text === '@ansible/aap-backend' ||
          node.text.startsWith('@ansible/aap-backend/'));
      const visit = (node: ts.Node) => {
        if (
          entry.name === 'aap-node' &&
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          isBackend(node.moduleSpecifier)
        ) {
          report();
        }
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          isLegacy(node.moduleSpecifier)
        ) {
          const bindings = ts.isImportDeclaration(node)
            ? node.importClause?.namedBindings
            : node.exportClause;
          if (
            !catalogConsumer ||
            node.moduleSpecifier.text !== `${legacy}/catalog` ||
            (ts.isImportDeclaration(node) && node.importClause?.name) ||
            !bindings ||
            (!ts.isNamedImports(bindings) && !ts.isNamedExports(bindings))
          ) {
            report();
          } else {
            for (const specifier of bindings.elements) {
              if (
                !temporaryCatalogExports.has(
                  (specifier.propertyName ?? specifier.name).text,
                )
              )
                report();
            }
          }
        }
        if (
          ts.isCallExpression(node) &&
          (isLegacy(node.arguments[0]) ||
            (entry.name === 'aap-node' && isBackend(node.arguments[0])))
        ) {
          const catalogSubpath =
            isLegacy(node.arguments[0]) &&
            node.arguments[0].text === `${legacy}/catalog`;
          const callee = node.expression;
          const moduleCall =
            callee.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(callee) && callee.text === 'require') ||
            (ts.isPropertyAccessExpression(callee) &&
              ['mock', 'doMock', 'requireActual'].includes(callee.name.text));
          // Catalog tests may mock only the temporary catalog-specific entry point.
          if (
            moduleCall &&
            (isBackend(node.arguments[0]) ||
              !catalogConsumer ||
              !catalogSubpath ||
              !file.endsWith('.test.ts'))
          )
            report();
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  expect(violations).toEqual([]);
});
