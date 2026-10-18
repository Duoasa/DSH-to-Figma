import test from 'node:test'
import assert from 'node:assert/strict'
import { RegistrationRejectedError, UnauthorizedError } from '@modelcontextprotocol/client'
import { figmaDiagnostic } from '../lib/diagnostics.mjs'

test('registration rejection is actionable without exposing SDK response bodies or submitted secrets',()=>{
  const error=new RegistrationRejectedError({status:403,body:'private-token-response',submittedMetadata:{client_name:'DSH to Figma',redirect_uris:['http://127.0.0.1:3056/callback'],client_secret:'private-client-secret'}})
  const diagnostic=figmaDiagnostic(error)
  assert.equal(diagnostic.code,'oauth_client_registration_forbidden')
  assert.equal(diagnostic.stage,'client_registration')
  assert.equal(diagnostic.httpStatus,403)
  assert.doesNotMatch(JSON.stringify(diagnostic),/private-token-response|private-client-secret/)
  assert.equal(figmaDiagnostic(new RegistrationRejectedError({status:400,body:'private',submittedMetadata:{redirect_uris:[]}})).code,'oauth_client_registration_rejected')
})
test('authorization, certificate and unknown failures stay distinct and redact raw messages',()=>{
  assert.equal(figmaDiagnostic(new UnauthorizedError()).code,'oauth_login_required')
  assert.equal(figmaDiagnostic({code:'FIGMA_LOGIN_REQUIRED'}).code,'oauth_login_required')
  assert.equal(figmaDiagnostic({cause:{code:'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'}}).code,'tls_certificate_error')
  assert.doesNotMatch(JSON.stringify(figmaDiagnostic(new Error('secret-token'))),/secret-token/)
})
