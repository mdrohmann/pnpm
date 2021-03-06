import assertProject from '@pnpm/assert-project'
import pnpmRegistryMock = require('pnpm-registry-mock')
import tape = require('tape')
import promisifyTape from 'tape-promise'
import promisify = require('util.promisify')
import {
  pathToLocalPkg,
  tempDir,
  execPnpm,
  execPnpmSync,
  prepare,
 } from './utils'
import ncpCB = require('ncp')

const test = promisifyTape(tape)
const ncp = promisify(ncpCB.ncp)

test('import from package-lock.json', async (t: tape.Test) => {
  await pnpmRegistryMock.addDistTag({ package: 'dep-of-pkg-with-1-dep', version: '100.1.0', distTag: 'latest' })
  tempDir(t)

  await ncp(pathToLocalPkg('has-package-lock-json'), process.cwd())

  await execPnpm('import')

  const project = assertProject(t, process.cwd())
  const shr = await project.loadShrinkwrap()
  t.ok(shr.packages['/dep-of-pkg-with-1-dep/100.0.0'])
  t.notOk(shr.packages['/dep-of-pkg-with-1-dep/100.1.0'])

  // node_modules is not created
  await project.hasNot('dep-of-pkg-with-1-dep')
  await project.hasNot('pkg-with-1-dep')
})

test('import from npm-shrinkwrap.json', async (t: tape.Test) => {
  await pnpmRegistryMock.addDistTag({ package: 'dep-of-pkg-with-1-dep', version: '100.1.0', distTag: 'latest' })
  tempDir(t)

  await ncp(pathToLocalPkg('has-npm-shrinkwrap-json'), process.cwd())

  await execPnpm('import')

  const project = assertProject(t, process.cwd())
  const shr = await project.loadShrinkwrap()
  t.ok(shr.packages['/dep-of-pkg-with-1-dep/100.0.0'])
  t.notOk(shr.packages['/dep-of-pkg-with-1-dep/100.1.0'])

  // node_modules is not created
  await project.hasNot('dep-of-pkg-with-1-dep')
  await project.hasNot('pkg-with-1-dep')
})

test('import fails when no npm lockfiles are found', async (t: tape.Test) => {
  prepare(t)

  const result = execPnpmSync('import')

  t.equal(result.status, 1)
  t.ok(result.stdout.toString().indexOf('No package-lock.json or npm-shrinkwrap.json found') !== -1)
})
