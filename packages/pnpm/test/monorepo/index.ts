import fs = require('mz/fs')
import tape = require('tape')
import promisifyTape from 'tape-promise'
import path = require('path')
import loadJsonFile from 'load-json-file'
import loadYamlFile = require('load-yaml-file')
import writeYamlFile = require('write-yaml-file')
import {
  preparePackages,
  execPnpm,
 } from '../utils'

const test = promisifyTape(tape)
const testOnly = promisifyTape(tape.only)

test('linking a package inside a monorepo', async (t: tape.Test) => {
  const projects = preparePackages(t, [
    {
      name: 'project-1',
      version: '1.0.0',
    },
    {
      name: 'project-2',
      version: '2.0.0',
    },
    {
      name: 'project-3',
      version: '3.0.0',
    },
    {
      name: 'project-4',
      version: '4.0.0',
    },
  ])

  await writeYamlFile('pnpm-workspace.yaml', {packages: ['**', '!store/**']})

  process.chdir('project-1')

  await execPnpm('link', 'project-2')

  await execPnpm('link', 'project-3', '--save-dev')

  await execPnpm('link', 'project-4', '--save-optional')

  const pkg = await import(path.resolve('package.json'))

  t.deepEqual(pkg && pkg.dependencies, {'project-2': '^2.0.0'}, 'spec of linked package added to dependencies')
  t.deepEqual(pkg && pkg.devDependencies, {'project-3': '^3.0.0'}, 'spec of linked package added to devDependencies')
  t.deepEqual(pkg && pkg.optionalDependencies, {'project-4': '^4.0.0'}, 'spec of linked package added to optionalDependencies')

  await projects['project-1'].has('project-2')
  await projects['project-1'].has('project-3')
  await projects['project-1'].has('project-4')
})

test('linking a package inside a monorepo with --link-workspace-packages when installing new dependencies', async (t: tape.Test) => {
  const projects = preparePackages(t, [
    {
      name: 'project-1',
      version: '1.0.0',
    },
    {
      name: 'project-2',
      version: '2.0.0',
    },
    {
      name: 'project-3',
      version: '3.0.0',
    },
    {
      name: 'project-4',
      version: '4.0.0',
    },
  ])

  await fs.writeFile('.npmrc', 'link-workspace-packages = true', 'utf8')
  await writeYamlFile('pnpm-workspace.yaml', {packages: ['**', '!store/**']})

  process.chdir('project-1')

  await execPnpm('install', 'project-2')

  await execPnpm('install', 'project-3', '--save-dev')

  await execPnpm('install', 'project-4', '--save-optional')

  const pkg = await import(path.resolve('package.json'))

  t.deepEqual(pkg && pkg.dependencies, {'project-2': '^2.0.0'}, 'spec of linked package added to dependencies')
  t.deepEqual(pkg && pkg.devDependencies, {'project-3': '^3.0.0'}, 'spec of linked package added to devDependencies')
  t.deepEqual(pkg && pkg.optionalDependencies, {'project-4': '^4.0.0'}, 'spec of linked package added to optionalDependencies')

  await projects['project-1'].has('project-2')
  await projects['project-1'].has('project-3')
  await projects['project-1'].has('project-4')
})

test('linking a package inside a monorepo with --link-workspace-packages', async (t: tape.Test) => {
  const projects = preparePackages(t, [
    {
      name: 'project-1',
      version: '1.0.0',
      dependencies: {
        'json-append': '1',
        'project-2': '2.0.0',
      },
      devDependencies: {
        'is-negative': '100.0.0',
      },
      optionalDependencies: {
        'is-positive': '1.0.0',
      },
      scripts: {
        install: `node -e "process.stdout.write('project-1')" | json-append ../output.json`,
      },
    },
    {
      name: 'project-2',
      version: '2.0.0',
      dependencies: {
        'json-append': '1',
      },
      scripts: {
        install: `node -e "process.stdout.write('project-2')" | json-append ../output.json`,
      },
    },
    {
      name: 'is-negative',
      version: '100.0.0',
    },
    {
      name: 'is-positive',
      version: '1.0.0',
    },
  ])

  await fs.writeFile('.npmrc', 'link-workspace-packages = true', 'utf8')
  await writeYamlFile('pnpm-workspace.yaml', {packages: ['**', '!store/**']})

  process.chdir('project-1')

  await execPnpm('install')

  const outputs = await import(path.resolve('..', 'output.json')) as string[]
  t.deepEqual(outputs, ['project-2', 'project-1'])

  await projects['project-1'].has('project-2')
  await projects['project-1'].has('is-negative')
  await projects['project-1'].has('is-positive')

  {
    const shr = await projects['project-1'].loadShrinkwrap()
    t.equal(shr.dependencies['project-2'], 'link:../project-2')
    t.equal(shr.devDependencies['is-negative'], 'link:../is-negative')
    t.equal(shr.optionalDependencies['is-positive'], 'link:../is-positive')
  }

  projects['is-positive'].writePackageJson({
    name: 'is-positive',
    version: '2.0.0',
  })

  await execPnpm('install')

  {
    const shr = await projects['project-1'].loadShrinkwrap()
    t.equal(shr.optionalDependencies['is-positive'], '1.0.0', 'is-positive is unlinked and installed from registry')
  }

  await execPnpm('update', 'is-negative@2.0.0')

  {
    const shr = await projects['project-1'].loadShrinkwrap()
    t.equal(shr.devDependencies['is-negative'], '2.0.0')
  }
})

test('topological order of packages with self-dependencies in monorepo is correct', async (t: tape.Test) => {
  preparePackages(t, [
    {
      name: 'project-1',
      version: '1.0.0',
      dependencies: { 'project-2': '1.0.0', 'project-3': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        install: `node -e "process.stdout.write('project-1')" | json-append ../output.json`,
        test: `node -e "process.stdout.write('project-1')" | json-append ../output2.json`,
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',
      dependencies: { 'project-2': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        install: `node -e "process.stdout.write('project-2')" | json-append ../output.json`,
        test: `node -e "process.stdout.write('project-2')" | json-append ../output2.json`,
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',
      dependencies: { 'project-2': '1.0.0', 'project-3': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        install: `node -e "process.stdout.write('project-3')" | json-append ../output.json`,
        test: `node -e "process.stdout.write('project-3')" | json-append ../output2.json`,
      },
    },
  ]);
  await fs.writeFile('.npmrc', 'link-workspace-packages = true', 'utf8')
  await writeYamlFile('pnpm-workspace.yaml', { packages: ['**', '!store/**'] })

  process.chdir('project-1')

  await execPnpm('install')

  const outputs = await import(path.resolve('..', 'output.json')) as string[]
  t.deepEqual(outputs, ['project-2', 'project-3', 'project-1'])

  await execPnpm('recursive', 'test')

  const outputs2 = await import(path.resolve('..', 'output2.json')) as string[]
  t.deepEqual(outputs2, ['project-2', 'project-3', 'project-1'])

})

test('do not get confused by filtered dependencies when searching for dependents in monorepo', async (t: tape.Test) => {
  /*
   In this test case, we are filtering for 'project-2' and its dependents with
   two projects in the dependency hierarchy, that can be ignored for this query,
   as they do not depend on 'project-2'.
  */
  preparePackages(t, [
    {
      name: 'unused-project-1',
      version: '1.0.0',
    },
    {
      name: 'unused-project-2',
      version: '1.0.0',
    },
    {
      name: 'project-2',
      version: '1.0.0',
      dependencies: { 'unused-project-1': '1.0.0', 'unused-project-2': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        test: `node -e "process.stdout.write('project-2')" | json-append ../output.json`,
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',
      dependencies: { 'project-2': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        test: `node -e "process.stdout.write('project-3')" | json-append ../output.json`,
      },
    },
    {
      name: 'project-4',
      version: '1.0.0',
      dependencies: { 'project-2': '1.0.0', 'unused-project-1': '1.0.0', 'unused-project-2': '1.0.0' },
      devDependencies: { 'json-append': '1' },
      scripts: {
        test: `node -e "process.stdout.write('project-4')" | json-append ../output.json`,
      },
    },
  ]);
  await fs.writeFile('.npmrc', 'link-workspace-packages = true', 'utf8')
  await writeYamlFile('pnpm-workspace.yaml', { packages: ['**', '!store/**'] })

  await execPnpm('install')

  process.chdir('project-2')

  await execPnpm('recursive', '--filter=...project-2', 'run', 'test')

  const outputs = await import(path.resolve('..', 'output.json')) as string[]
  // project-2 should be executed first, we cannot say anything about the order
  // of the last two packages.
  t.equal(outputs[0], 'project-2')

})
// TODO: make it pass
test['skip']('installation with --link-workspace-packages links packages even if they were previously installed from registry', async (t: tape.Test) => {
  const projects = preparePackages(t, [
    {
      name: 'project',
      version: '1.0.0',
      dependencies: {
        'is-positive': '2.0.0',
      },
    },
    {
      name: 'is-positive',
      version: '2.0.0',
    },
  ])

  await execPnpm('recursive', 'install', '--no-link-workspace-packages')

  {
    const shr = await projects['project'].loadShrinkwrap()
    t.equal(shr.dependencies['is-positive'], '2.0.0')
  }

  await execPnpm('recursive', 'install', '--link-workspace-packages')

  {
    const shr = await projects['project'].loadShrinkwrap()
    t.equal(shr.dependencies['is-positive'], 'link:../is-positive')
  }
})

test('recursive install with link-workspace-packages and shared-workspace-shrinkwrap', async (t: tape.Test) => {
  const projects = preparePackages(t, [
    {
      name: 'is-positive',
      version: '1.0.0',
      dependencies: {
        'json-append': '1',
        'is-negative': '1.0.0',
      },
      scripts: {
        install: `node -e "process.stdout.write('is-positive')" | json-append ../output.json`,
      },
    },
    // This empty package is added to the workspace only to verify
    // that empty package does not remove .pendingBuild from .modules.yaml
    {
      name: 'is-positive2',
      version: '1.0.0',
    },
    {
      name: 'project-1',
      version: '1.0.0',
      devDependencies: {
        'json-append': '1',
        'is-positive': '1.0.0',
      },
      scripts: {
        install: `node -e "process.stdout.write('project-1')" | json-append ../output.json`,
      },
    },
  ])

  await writeYamlFile('pnpm-workspace.yaml', { packages: ['**', '!store/**'] })
  await fs.writeFile('is-positive/.npmrc', 'shamefully-flatten = true', 'utf8') // package-specific configs

  await execPnpm('recursive', 'install', '--link-workspace-packages', '--shared-workspace-shrinkwrap=true', '--store', 'store')

  t.ok(projects['is-positive'].requireModule('is-negative'))
  t.ok(projects['is-positive'].requireModule('concat-stream'), 'dependencies flattened in is-positive')
  t.notOk(projects['project-1'].requireModule('is-positive/package.json').author, 'local package is linked')

  const sharedShr = await loadYamlFile('shrinkwrap.yaml')
  t.equal(sharedShr['importers']['project-1']['devDependencies']['is-positive'], 'link:../is-positive')

  const outputs = await import(path.resolve('output.json')) as string[]
  t.deepEqual(outputs, ['is-positive', 'project-1'])

  const storeJson = await loadJsonFile<object>(path.resolve('store', '2', 'store.json'))
  t.deepEqual(storeJson['localhost+4873/is-negative/1.0.0'].length, 1, 'new connections saved in store.json')
})

test('recursive installation with shared-workspace-shrinkwrap and a readPackage hook', async (t) => {
  const projects = preparePackages(t, [
    {
      name: 'project-1',
      version: '1.0.0',
      dependencies: {
        'is-positive': '1.0.0',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',
      dependencies: {
        'is-negative': '1.0.0',
      },
    },
  ])

  const pnpmfile = `
    module.exports = { hooks: { readPackage } }
    function readPackage (pkg) {
      pkg.dependencies = pkg.dependencies || {}
      pkg.dependencies['dep-of-pkg-with-1-dep'] = '100.1.0'
      return pkg
    }
  `
  await fs.writeFile('pnpmfile.js', pnpmfile, 'utf8')
  await writeYamlFile('pnpm-workspace.yaml', { packages: ['**', '!store/**'] })

  await execPnpm('recursive', 'install', '--shared-workspace-shrinkwrap', '--store', 'store')

  const shr = await loadYamlFile('./shrinkwrap.yaml') as any // tslint:disable-line:no-any
  t.ok(shr.packages['/dep-of-pkg-with-1-dep/100.1.0'], 'new dependency added by hook')
})
