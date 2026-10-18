import { RegistrationRejectedError, UnauthorizedError } from '@modelcontextprotocol/client'

// Only fixed messages and numeric HTTP status may leave the error boundary.
// SDK errors can embed token responses, client secrets and callback parameters.
export function figmaDiagnostic(error) {
  if (error instanceof RegistrationRejectedError) {
    const status = Number.isInteger(error.status) ? error.status : null
    return {
      code: status === 403 ? 'oauth_client_registration_forbidden' : 'oauth_client_registration_rejected',
      stage: 'client_registration',
      httpStatus: status,
      message: 'Figma rejected OAuth client registration before user authorization. Canvas tools have not been verified.',
      nextStep: 'Use a Figma-approved MCP client registration or apply for client access. A normal Figma account login alone does not resolve this rejection.',
      documentation: 'https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/',
    }
  }
  if (error instanceof UnauthorizedError || error?.code === 'FIGMA_LOGIN_REQUIRED') return {
    code: 'oauth_login_required', stage: 'authorization',
    message: 'Figma authorization is required. Run dsh-figma login with the same DSH home.',
  }
  if (['UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED','SELF_SIGNED_CERT_IN_CHAIN'].includes(error?.cause?.code)) return {
    code: 'tls_certificate_error', stage: 'connection',
    message: 'TLS certificate verification failed. Check the trusted certificate configuration; do not disable certificate validation.',
  }
  return {
    code: 'official_unavailable_or_login_required', stage: 'connection',
    message: 'Figma connection failed. Check network access, credentials, client approval and server availability. Sensitive server responses are not logged.',
  }
}
