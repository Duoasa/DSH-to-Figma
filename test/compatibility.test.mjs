import test from 'node:test'
import assert from 'node:assert/strict'
import semver from 'semver'
import pkg from '../package.json' with {type:'json'}
import lock from '../package-lock.json' with {type:'json'}

test('0.3.5 retains broad host peers and admits the tested DSH 0.2.2 runtime',()=>{
  assert.equal(pkg.engines.dsh,'*')
  for(const name of ['dsh-home-paths','dsh-mcp-client','dsh-skill']) {
    const key='@deepseek-ai/'+name,range=pkg.peerDependencies[key]
    for(const version of ['0.2.0','0.2.1','0.2.2','0.2.3','0.2.99','0.2.0-rc.2','0.2.1-rc.3','0.2.1-rc.5','0.2.1-rc.100','0.2.2-alpha.1','0.2.2-rc.1','0.2.2-beta.9','0.2.2-rc.99'])assert.equal(semver.satisfies(version,range),true,`${key}: ${version}`)
    for(const version of ['0.1.9','0.3.0-alpha.1','0.3.0','1.0.0'])assert.equal(semver.satisfies(version,range),false,`${key}: ${version}`)
    // npm excludes prereleases of unlisted patch tuples; document rather than overclaim admission.
    assert.equal(semver.satisfies('0.2.3-rc.1',range),false)
    assert.equal(lock.packages[''].peerDependencies[key],range)
    assert.equal(pkg.devDependencies[key],'0.2.1-rc.5','reproducible test runtime stays pinned')
  }
  for(const [name,accepted,rejected] of [
    ['@deepseek-ai/cordis',['4.0.4','4.0.5','4.0.99','4.1.0','4.1.99'],['4.2.0','5.0.0']],
    ['@deepseek-ai/schemastery',['3.18.4','3.18.5','3.18.99','3.19.0','3.19.99'],['3.20.0','4.0.0']]
  ]) {
    for(const version of accepted)assert.equal(semver.satisfies(version,pkg.peerDependencies[name]),true)
    for(const version of rejected)assert.equal(semver.satisfies(version,pkg.peerDependencies[name]),false)
    assert.equal(lock.packages[''].peerDependencies[name],pkg.peerDependencies[name])
  }
})
