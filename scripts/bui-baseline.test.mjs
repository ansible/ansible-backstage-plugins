import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  added,
  buildBaseline,
  emitBaseline,
  parseBaseline,
  removed,
} from './lib/bui-baseline.mjs';

const MODEL = {
  libraries: [
    {
      name: '@patternfly/react-core',
      reason: 'Pre-BUI design requirements; 1 file, confined to aap',
      files: ['workspaces/aap/plugins/p/src/components/Button/Button.tsx'],
    },
  ],
  components: [
    {
      path: 'workspaces/aap/plugins/p/src/components/Button/Button.tsx',
      name: 'Button',
    },
  ],
};

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'bui-baseline-test-'));
  mkdirSync(join(root, 'workspaces', 'aap', 'plugins', 'p', 'src'), {
    recursive: true,
  });
  for (const [name, contents] of Object.entries(files)) {
    const target = join(root, 'workspaces', 'aap', 'plugins', 'p', 'src', name);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
}

test('emitted YAML round-trips through the parser', () => {
  assert.deepEqual(parseBaseline(emitBaseline(MODEL)), MODEL);
});

test('emitted YAML is stable across runs', () => {
  assert.equal(emitBaseline(MODEL), emitBaseline(structuredClone(MODEL)));
});

test('parser rejects lines it does not understand', () => {
  assert.throws(
    () => parseBaseline('libraries:\n  - nope: x\n'),
    /unexpected line/,
  );
});

test('baseline counts a non-BUI component and its library', () => {
  const root = fixture({
    'Button.tsx':
      "import { Button } from '@patternfly/react-core';\nexport const PfButton = () => <Button />;\n",
  });
  try {
    const model = buildBaseline(root);
    assert.deepEqual(
      model.libraries.map(l => l.name),
      ['@patternfly/react-core'],
    );
    assert.deepEqual(model.components, [
      { path: 'workspaces/aap/plugins/p/src/Button.tsx', name: 'PfButton' },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('baseline ignores components written against BUI', () => {
  const root = fixture({
    'Card.tsx':
      "import { Card } from '@backstage/ui';\nexport const BuiCard = () => <Card />;\n",
  });
  try {
    const model = buildBaseline(root);
    assert.deepEqual(model, { libraries: [], components: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('baseline ignores tests, stories and all-caps constants', () => {
  const root = fixture({
    'Button.test.tsx':
      "import { Button } from '@patternfly/react-core';\nexport const T = () => <Button />;\n",
    'Button.stories.tsx':
      "import { Button } from '@patternfly/react-core';\nexport const S = () => <Button />;\n",
    'Button.tsx':
      "import { Button } from '@patternfly/react-core';\nexport const BUTTON_PATH = '/x';\nexport const Real = () => <Button />;\n",
  });
  try {
    const model = buildBaseline(root);
    assert.deepEqual(
      model.components.map(c => c.name),
      ['Real'],
    );
    assert.equal(model.libraries[0].files.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a .ts helper importing a non-BUI kit is tracked without a component', () => {
  const root = fixture({
    'helpers.ts':
      "import { Link } from '@material-ui/core';\nexport const url = () => Link;\n",
  });
  try {
    const model = buildBaseline(root);
    assert.deepEqual(model.components, []);
    assert.deepEqual(model.libraries[0].files, [
      'workspaces/aap/plugins/p/src/helpers.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('counts dynamic imports and require()', () => {
  const root = fixture({
    'alpha.tsx':
      "const load = () => import('@material-ui/core');\nexport const Loader = () => null;\n",
    'legacy.ts':
      "const mui = require('@material-ui/icons');\nexport const icon = mui;\n",
  });
  try {
    const model = buildBaseline(root);
    assert.deepEqual(
      model.libraries.map(l => l.name),
      ['@material-ui/core', '@material-ui/icons'],
    );
    assert.deepEqual(
      model.components.map(c => c.name),
      ['Loader'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('counts components exported by name or as default', () => {
  const root = fixture({
    'Logo.tsx':
      "import { makeStyles } from '@material-ui/core';\nconst LogoFull = () => null;\nexport default LogoFull;\n",
    'Icon.tsx':
      "import { makeStyles } from '@material-ui/core';\nfunction LogoIcon() {\n  return null;\n}\nexport { LogoIcon };\n",
    'Modal.tsx':
      "import { makeStyles } from '@material-ui/core';\nexport default function Modal() {\n  return null;\n}\n",
  });
  try {
    const model = buildBaseline(root);
    assert.deepEqual(
      model.components.map(c => c.name),
      ['LogoIcon', 'LogoFull', 'Modal'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not count a re-export of another module', () => {
  const root = fixture({
    'index.tsx':
      "import { Box } from '@material-ui/core';\nexport { Thing } from './Thing';\nexport const Local = () => <Box />;\n",
  });
  try {
    const model = buildBaseline(root);
    assert.deepEqual(
      model.components.map(c => c.name),
      ['Local'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('added() reports growth and removed() allows shrinkage', () => {
  const shrunk = { ...MODEL, components: [] };
  assert.deepEqual(added(MODEL, MODEL), []);
  assert.deepEqual(removed(MODEL, MODEL), []);
  assert.deepEqual(added(MODEL, shrunk), []);
  assert.equal(removed(MODEL, shrunk).length, 1);
  assert.equal(added(shrunk, MODEL).length, 1);
});
