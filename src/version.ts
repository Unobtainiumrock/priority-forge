/**
 * Priority Forge - Single source of truth for version
 * 
 * Update VERSION here and it propagates everywhere:
 * - Backend startup banner
 * - MCP server info
 * - REST API responses
 * - Frontend (via /version endpoint)
 */

export const VERSION = '4.0.0';
export const VERSION_TAG = `v${VERSION}`;
export const APP_NAME = 'Priority Forge';
export const FULL_NAME = `${APP_NAME} ${VERSION_TAG}`;
