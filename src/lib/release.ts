export const RELEASE_VERSION = '1.0.0-rc.1';
export const RELEASE_STAGE = 16;

export function deploymentIdentity() {
  return {
    release: RELEASE_VERSION,
    stage: RELEASE_STAGE,
    commit: process.env.RENDER_GIT_COMMIT?.trim() || null,
    branch: process.env.RENDER_GIT_BRANCH?.trim() || null,
    serviceName: process.env.RENDER_SERVICE_NAME?.trim() || null,
    externalUrl: process.env.RENDER_EXTERNAL_URL?.trim() || null,
  };
}
