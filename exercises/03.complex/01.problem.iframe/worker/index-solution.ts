import { type DBClient } from '@epic-web/epicme-db-client'
import { invariant } from '@epic-web/invariant'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { McpAgent } from 'agents/mcp'
import { db } from '../db.ts'
import { initializePrompts } from './prompts.ts'
import { initializeResources } from './resources.ts'
import { initializeTools } from './tools.ts'

/**
 * Props interface for the EpicMeMCP agent.
 * Contains the baseUrl which is essential for constructing iframe URLs dynamically.
 * This allows the same code to work across different environments (local, staging, production)
 * without hardcoding URLs.
 */
export type Props = { baseUrl: string }

/**
 * State interface for the EpicMeMCP agent.
 * Currently empty but can be extended for future state management needs.
 */
type State = {}

/**
 * EpicMeMCP Agent - Main MCP server implementation for the EpicMe journaling application.
 * 
 * This class extends McpAgent to provide a complete MCP server that handles:
 * - Journal entry CRUD operations
 * - Tag management
 * - Rich UI components via iframe embedding
 * - Dynamic URL construction for cross-environment compatibility
 * 
 * Key Features:
 * - Uses iframe-based UI components for rich, interactive experiences
 * - Dynamically constructs URLs based on request origin
 * - Provides comprehensive journal and tag management tools
 * - Supports both programmatic and visual interfaces
 */
export class EpicMeMCP extends McpAgent<Env, State, Props> {
	/**
	 * Database client instance for all data operations.
	 * Initialized in the init() method to ensure proper setup.
	 */
	db!: DBClient

	/**
	 * MCP Server instance configured with EpicMe-specific capabilities and instructions.
	 * 
	 * Capabilities enabled:
	 * - tools.listChanged: Notifies clients when tool list changes
	 * - resources.listChanged: Notifies clients when resource list changes  
	 * - resources.subscribe: Allows clients to subscribe to resource updates
	 * - completions: Enables completion functionality
	 * - logging: Enables logging capabilities
	 * - prompts.listChanged: Notifies clients when prompt list changes
	 */
	server = new McpServer(
		{
			name: 'epicme',
			title: 'EpicMe Journal',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: { listChanged: true },
				resources: { listChanged: true, subscribe: true },
				completions: {},
				logging: {},
				prompts: { listChanged: true },
			},
			instructions: `
EpicMe is a journaling app that allows users to write about and review their experiences, thoughts, and reflections.

These tools are the user's window into their journal. With these tools and your help, they can create, read, and manage their journal entries and associated tags.

You can also help users add tags to their entries and get all tags for an entry.
			`.trim(),
		},
	)

	/**
	 * Initialize the MCP agent by setting up the database connection
	 * and registering all tools, resources, and prompts.
	 * 
	 * This method is called automatically when the agent is created
	 * and ensures all components are properly configured.
	 */
	async init() {
		this.db = db
		await initializeTools(this)
		await initializeResources(this)
		await initializePrompts(this)
	}

	/**
	 * Utility method to safely retrieve the baseUrl from props.
	 * 
	 * This method is crucial for iframe URL construction in tools like 'view_journal'.
	 * It ensures that the baseUrl is available and throws an error if it's not set,
	 * which should never happen in normal operation since the worker sets it.
	 * 
	 * @returns The base URL string (e.g., "https://example.com" or "http://localhost:3000")
	 * @throws Error if baseUrl is not set in props
	 */
	requireBaseUrl() {
		const baseUrl = this.props?.baseUrl
		invariant(baseUrl, 'Unexpected: baseUrl not set on agent')
		return baseUrl
	}
}
