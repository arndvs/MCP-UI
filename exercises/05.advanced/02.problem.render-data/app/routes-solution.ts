import { type RouteConfig, index, route } from '@react-router/dev/routes'

/**
 * ROUTE CONFIGURATION - RENDER DATA SECURITY IMPLEMENTATION
 * 
 * This file demonstrates the security improvement by removing dynamic route parameters
 * that previously allowed direct access to journal entries via URL manipulation.
 * 
 * KEY CHANGES FOR SECURITY:
 * 1. Removed `:entryId` dynamic segment from `/ui/entry-viewer/:entryId`
 * 2. Now uses `/ui/entry-viewer` without parameters
 * 3. Entry data is passed via render data from MCP server instead of URL
 * 
 * SECURITY BENEFITS:
 * - Prevents direct URL access to journal entries
 * - Data is only accessible through authenticated MCP tool calls
 * - Entry information is passed securely via render data mechanism
 * - No sensitive data exposed in URLs or query parameters
 * 
 * RENDER DATA FLOW:
 * 1. LLM calls `view_entry` tool with entry ID
 * 2. MCP server fetches entry data and includes it in uiMetadata
 * 3. Host application creates iframe with render data
 * 4. Entry viewer component waits for and receives render data
 * 5. Component renders with authenticated data
 */
export default [
	index('routes/index.tsx'),
	route('healthcheck', 'routes/healthcheck.tsx'),
	route('ui/journal-viewer', 'routes/ui/journal-viewer.tsx'),
	// 🔒 SECURITY: No dynamic segment - entry data comes from render data
	route('ui/entry-viewer', 'routes/ui/entry-viewer.tsx'),
	route('/*', 'routes/catch-all.tsx'),
] satisfies RouteConfig
