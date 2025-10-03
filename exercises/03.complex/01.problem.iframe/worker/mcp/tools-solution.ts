import {
	createEntryInputSchema,
	createTagInputSchema,
	entryIdSchema,
	entryListItemSchema,
	entryTagIdSchema,
	entryTagSchema,
	entryWithTagsSchema,
	tagIdSchema,
	tagListItemSchema,
	tagSchema,
	updateEntryInputSchema,
	updateTagInputSchema,
} from '@epic-web/epicme-db-client/schema'
import { invariant } from '@epic-web/invariant'
import { createUIResource } from '@mcp-ui/server'
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type EpicMeMCP } from './index-solution.ts'
import { suggestTagsSampling } from './sampling.ts'
import { getTagViewUI } from './ui.ts'

/**
 * Initialize all MCP tools for the EpicMe journaling application.
 * 
 * This function registers all available tools with the MCP server, including:
 * - Journal entry CRUD operations (create, read, update, delete, list)
 * - Tag management operations (create, read, update, delete, list)
 * - Rich UI components using iframe embedding
 * - Tag-to-entry relationship management
 * 
 * Key Features:
 * - Uses iframe-based UI for rich, interactive experiences (view_journal tool)
 * - Provides both programmatic and visual interfaces
 * - Includes confirmation prompts for destructive operations
 * - Supports structured content and resource links
 * 
 * @param agent The EpicMeMCP agent instance to register tools with
 */
export async function initializeTools(agent: EpicMeMCP) {
	/**
	 * Create Entry Tool - Creates a new journal entry with optional tags.
	 * 
	 * This tool handles the creation of journal entries and automatically:
	 * - Creates the entry in the database
	 * - Associates any provided tags with the entry
	 * - Triggers tag suggestion sampling for AI-powered recommendations
	 * - Returns both structured data and user-friendly content
	 * 
	 * Features:
	 * - Non-destructive operation (destructiveHint: false)
	 * - Supports tag association during creation
	 * - Provides resource links for easy navigation
	 * - Includes structured content for programmatic access
	 */
	agent.server.registerTool(
		'create_entry',
		{
			title: 'Create Entry',
			description: 'Create a new journal entry',
			annotations: {
				destructiveHint: false,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: createEntryInputSchema,
			outputSchema: { entry: entryWithTagsSchema },
		},
		async (entry) => {
			// Create the entry in the database
			const createdEntry = await agent.db.createEntry(entry)
			
			// If tags were provided, associate them with the entry
			if (entry.tags) {
				for (const tagId of entry.tags) {
					await agent.db.addTagToEntry({
						entryId: createdEntry.id,
						tagId,
					})
				}
			}

			// Trigger AI-powered tag suggestion sampling (fire-and-forget)
			void suggestTagsSampling(agent, createdEntry.id)

			const structuredContent = { entry: createdEntry }
			return {
				structuredContent,
				content: [
					createText(
						`Entry "${createdEntry.title}" created successfully with ID "${createdEntry.id}"`,
					),
					createEntryResourceLink(createdEntry),
					createText(structuredContent),
				],
			}
		},
	)

	/**
	 * View Journal Tool - Displays the journal in a rich, interactive iframe interface.
	 * 
	 * This is the key tool that demonstrates iframe-based UI components in MCP.
	 * Instead of returning plain text or raw HTML, it embeds a full React application
	 * that provides a sophisticated journal viewing experience.
	 * 
	 * Key Features:
	 * - Uses iframe embedding for rich, interactive UI
	 * - Dynamically constructs URLs based on request origin (no hardcoded URLs)
	 * - Leverages the full web ecosystem (React, routing, styling)
	 * - Provides a professional, application-like experience
	 * 
	 * Technical Implementation:
	 * - Creates a unique URI using Date.now() for cache-busting
	 * - Uses externalUrl content type to embed the iframe
	 * - Constructs the iframe URL dynamically using agent.requireBaseUrl()
	 * - Points to the same server's /ui/journal-viewer route
	 * 
	 * This approach allows the same MCP server to serve both the API and the UI,
	 * making it easy to deploy and maintain across different environments.
	 */
	agent.server.registerTool(
		'view_journal',
		{
			title: 'View Journal',
			description: 'View the journal visually',
			annotations: {
				readOnlyHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
		},
		async () => {
			// Dynamically construct the iframe URL using the base URL from the request
			// This ensures the same code works across different environments
			const iframeUrl = new URL('/ui/journal-viewer', agent.requireBaseUrl())

			return {
				content: [
					createUIResource({
						// Create a unique URI for this UI resource
						// Date.now() provides sufficient uniqueness for this use case
						uri: `ui://view-journal/${Date.now()}`,
						content: {
							type: 'externalUrl',
							// Convert URL object to string for the iframe
							iframeUrl: iframeUrl.toString(),
						},
						encoding: 'text',
					}),
				],
			}
		},
	)

	/**
	 * Get Entry Tool - Retrieves a specific journal entry by ID.
	 * 
	 * This tool fetches a single journal entry and returns it with all associated tags.
	 * It's a read-only operation that provides both structured data and resource links.
	 * 
	 * Features:
	 * - Read-only operation (readOnlyHint: true)
	 * - Returns entry with all associated tags
	 * - Provides resource links for easy navigation
	 * - Throws error if entry not found
	 */
	agent.server.registerTool(
		'get_entry',
		{
			title: 'Get Entry',
			description: 'Get a journal entry by ID',
			annotations: {
				readOnlyHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: entryIdSchema,
			outputSchema: { entry: entryWithTagsSchema },
		},
		async ({ id }) => {
			const entry = await agent.db.getEntry(id)
			invariant(entry, `Entry with ID "${id}" not found`)
			const structuredContent = { entry }
			return {
				structuredContent,
				content: [
					createEntryResourceLink(entry),
					createText(structuredContent),
				],
			}
		},
	)

	/**
	 * List Entries Tool - Retrieves all journal entries.
	 * 
	 * This tool returns a list of all journal entries with their basic information.
	 * It's useful for getting an overview of all entries without loading full content.
	 * 
	 * Features:
	 * - Read-only operation (readOnlyHint: true)
	 * - Returns array of entry list items (summary information)
	 * - Provides resource links for each entry
	 * - Includes count information in the response
	 */
	agent.server.registerTool(
		'list_entries',
		{
			title: 'List Entries',
			description: 'List all journal entries',
			annotations: {
				readOnlyHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			outputSchema: {
				entries: z.array(entryListItemSchema),
			},
		},
		async () => {
			const entries = await agent.db.getEntries()
			const entryLinks = entries.map(createEntryResourceLink)
			const structuredContent = { entries }
			return {
				structuredContent,
				content: [
					createText(`Found ${entries.length} entries.`),
					...entryLinks,
					createText(structuredContent),
				],
			}
		},
	)

	/**
	 * Update Entry Tool - Updates an existing journal entry.
	 * 
	 * This tool allows partial updates to journal entries. Fields that are not provided
	 * (or set to undefined) will not be updated, while fields set to null or other values
	 * will be updated.
	 * 
	 * Features:
	 * - Non-destructive operation (destructiveHint: false)
	 * - Idempotent operation (idempotentHint: true)
	 * - Supports partial updates
	 * - Validates entry exists before updating
	 * - Returns updated entry with all tags
	 */
	agent.server.registerTool(
		'update_entry',
		{
			title: 'Update Entry',
			description:
				'Update a journal entry. Fields that are not provided (or set to undefined) will not be updated. Fields that are set to null or any other value will be updated.',
			annotations: {
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: updateEntryInputSchema,
			outputSchema: { entry: entryWithTagsSchema },
		},
		async ({ id, ...updates }) => {
			const existingEntry = await agent.db.getEntry(id)
			invariant(existingEntry, `Entry with ID "${id}" not found`)
			const updatedEntry = await agent.db.updateEntry(id, updates)
			const structuredContent = { entry: updatedEntry }
			return {
				structuredContent,
				content: [
					createText(
						`Entry "${updatedEntry.title}" (ID: ${id}) updated successfully`,
					),
					createEntryResourceLink(updatedEntry),
					createText(structuredContent),
				],
			}
		},
	)

	/**
	 * Delete Entry Tool - Deletes a journal entry with user confirmation.
	 * 
	 * This tool demonstrates destructive operations with user confirmation.
	 * It asks the user to confirm before proceeding with the deletion.
	 * 
	 * Features:
	 * - Idempotent operation (idempotentHint: true)
	 * - Requires user confirmation before deletion
	 * - Validates entry exists before attempting deletion
	 * - Returns success status and deleted entry information
	 * - Handles user rejection gracefully
	 * 
	 * Note: Currently returns true for confirmation due to Cloudflare limitations
	 * with elicitation support. In a full implementation, this would prompt the user.
	 */
	agent.server.registerTool(
		'delete_entry',
		{
			title: 'Delete Entry',
			description: 'Delete a journal entry',
			annotations: {
				idempotentHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: entryIdSchema,
			outputSchema: { success: z.boolean(), entry: entryWithTagsSchema },
		},
		async ({ id }) => {
			const existingEntry = await agent.db.getEntry(id)
			invariant(existingEntry, `Entry with ID "${id}" not found`)
			
			// Request user confirmation for destructive operation
			const confirmed = await elicitConfirmation(
				agent,
				`Are you sure you want to delete entry "${existingEntry.title}" (ID: ${id})?`,
			)
			
			if (!confirmed) {
				const structuredContent = {
					success: false,
					entry: existingEntry,
				}
				return {
					structuredContent,
					content: [
						createText(
							`Deleting entry "${existingEntry.title}" (ID: ${id}) rejected by the user.`,
						),
						createText(structuredContent),
					],
				}
			}

			// Proceed with deletion
			await agent.db.deleteEntry(id)

			const structuredContent = { success: true, entry: existingEntry }
			return {
				structuredContent,
				content: [
					createText(
						`Entry "${existingEntry.title}" (ID: ${id}) deleted successfully`,
					),
					createEntryResourceLink(existingEntry),
					createText(structuredContent),
				],
			}
		},
	)

	/**
	 * Create Tag Tool - Creates a new tag for categorizing journal entries.
	 * 
	 * This tool creates a new tag that can be used to categorize and organize
	 * journal entries. Tags help users find and group related entries.
	 * 
	 * Features:
	 * - Non-destructive operation (destructiveHint: false)
	 * - Returns created tag information
	 * - Provides resource links for easy navigation
	 * - Includes structured content for programmatic access
	 */
	agent.server.registerTool(
		'create_tag',
		{
			title: 'Create Tag',
			description: 'Create a new tag',
			annotations: {
				destructiveHint: false,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: createTagInputSchema,
			outputSchema: { tag: tagSchema },
		},
		async (tag) => {
			const createdTag = await agent.db.createTag(tag)
			const structuredContent = { tag: createdTag }
			return {
				structuredContent,
				content: [
					createText(
						`Tag "${createdTag.name}" created successfully with ID "${createdTag.id}"`,
					),
					createTagResourceLink(createdTag),
					createText(structuredContent),
				],
			}
		},
	)

	/**
	 * View Tag Tool - Displays a tag visually using raw HTML.
	 * 
	 * This tool demonstrates raw HTML UI components in MCP.
	 * It generates HTML content for displaying tag information
	 * and returns it as a UI resource.
	 * 
	 * Features:
	 * - Read-only operation (readOnlyHint: true)
	 * - Uses rawHtml content type for simple HTML display
	 * - Generates HTML using the getTagViewUI function
	 * - Provides visual representation of tag data
	 */
	agent.server.registerTool(
		'view_tag',
		{
			title: 'View Tag',
			description: 'View a tag by ID visually',
			annotations: {
				readOnlyHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: tagIdSchema,
		},
		async ({ id }) => {
			return {
				content: [
					createUIResource({
						uri: `ui://view-tag/${id}`,
						content: {
							type: 'rawHtml',
							htmlString: await getTagViewUI(agent.db, id),
						},
						encoding: 'text',
					}),
				],
			}
		},
	)

	/**
	 * Get Tag Tool - Retrieves a specific tag by ID.
	 * 
	 * This tool fetches a single tag and returns its information.
	 * It's a read-only operation that provides both structured data and resource links.
	 * 
	 * Features:
	 * - Read-only operation (readOnlyHint: true)
	 * - Returns tag information
	 * - Provides resource links for easy navigation
	 * - Throws error if tag not found
	 */
	agent.server.registerTool(
		'get_tag',
		{
			title: 'Get Tag',
			description: 'Get a tag by ID',
			annotations: {
				readOnlyHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: tagIdSchema,
			outputSchema: { tag: tagSchema },
		},
		async ({ id }) => {
			const tag = await agent.db.getTag(id)
			invariant(tag, `Tag ID "${id}" not found`)
			const structuredContent = { tag }
			return {
				structuredContent,
				content: [createTagResourceLink(tag), createText(structuredContent)],
			}
		},
	)

	/**
	 * List Tags Tool - Retrieves all available tags.
	 * 
	 * This tool returns a list of all tags in the system.
	 * It's useful for getting an overview of available tags.
	 * 
	 * Features:
	 * - Read-only operation (readOnlyHint: true)
	 * - Returns array of tag list items (summary information)
	 * - Provides resource links for each tag
	 * - Includes count information in the response
	 */
	agent.server.registerTool(
		'list_tags',
		{
			title: 'List Tags',
			description: 'List all tags',
			annotations: {
				readOnlyHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			outputSchema: { tags: z.array(tagListItemSchema) },
		},
		async () => {
			const tags = await agent.db.getTags()
			const tagLinks = tags.map(createTagResourceLink)
			const structuredContent = { tags }
			return {
				structuredContent,
				content: [
					createText(`Found ${tags.length} tags.`),
					...tagLinks,
					createText(structuredContent),
				],
			}
		},
	)

	/**
	 * Update Tag Tool - Updates an existing tag.
	 * 
	 * This tool allows updating tag information such as name or description.
	 * It supports partial updates and validates the tag exists before updating.
	 * 
	 * Features:
	 * - Non-destructive operation (destructiveHint: false)
	 * - Idempotent operation (idempotentHint: true)
	 * - Supports partial updates
	 * - Returns updated tag information
	 * - Provides resource links for easy navigation
	 */
	agent.server.registerTool(
		'update_tag',
		{
			title: 'Update Tag',
			description: 'Update a tag',
			annotations: {
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: updateTagInputSchema,
			outputSchema: { tag: tagSchema },
		},
		async ({ id, ...updates }) => {
			const updatedTag = await agent.db.updateTag(id, updates)
			const structuredContent = { tag: updatedTag }
			return {
				structuredContent,
				content: [
					createText(
						`Tag "${updatedTag.name}" (ID: ${id}) updated successfully`,
					),
					createTagResourceLink(updatedTag),
					createText(structuredContent),
				],
			}
		},
	)

	/**
	 * Delete Tag Tool - Deletes a tag with user confirmation.
	 * 
	 * This tool demonstrates destructive operations with user confirmation for tags.
	 * It asks the user to confirm before proceeding with the deletion.
	 * 
	 * Features:
	 * - Idempotent operation (idempotentHint: true)
	 * - Requires user confirmation before deletion
	 * - Validates tag exists before attempting deletion
	 * - Returns success status and deleted tag information
	 * - Handles user rejection gracefully
	 * 
	 * Note: Currently returns true for confirmation due to Cloudflare limitations
	 * with elicitation support. In a full implementation, this would prompt the user.
	 */
	agent.server.registerTool(
		'delete_tag',
		{
			title: 'Delete Tag',
			description: 'Delete a tag',
			annotations: {
				idempotentHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: tagIdSchema,
			outputSchema: { success: z.boolean(), tag: tagSchema },
		},
		async ({ id }) => {
			const existingTag = await agent.db.getTag(id)
			invariant(existingTag, `Tag ID "${id}" not found`)
			
			// Request user confirmation for destructive operation
			const confirmed = await elicitConfirmation(
				agent,
				`Are you sure you want to delete tag "${existingTag.name}" (ID: ${id})?`,
			)

			if (!confirmed) {
				const structuredContent = { success: false, tag: existingTag }
				return {
					structuredContent,
					content: [
						createText(
							`Deleting tag "${existingTag.name}" (ID: ${id}) rejected by the user.`,
						),
						createTagResourceLink(existingTag),
						createText(structuredContent),
					],
				}
			}

			// Proceed with deletion
			await agent.db.deleteTag(id)
			const structuredContent = { success: true, tag: existingTag }
			return {
				structuredContent,
				content: [
					createText(
						`Tag "${existingTag.name}" (ID: ${id}) deleted successfully`,
					),
					createTagResourceLink(existingTag),
					createText(structuredContent),
				],
			}
		},
	)

	/**
	 * Add Tag to Entry Tool - Associates a tag with a journal entry.
	 * 
	 * This tool creates a relationship between a tag and a journal entry,
	 * allowing entries to be categorized and organized by tags.
	 * 
	 * Features:
	 * - Non-destructive operation (destructiveHint: false)
	 * - Idempotent operation (idempotentHint: true)
	 * - Validates both tag and entry exist before creating relationship
	 * - Returns success status and relationship information
	 * - Provides resource links for both tag and entry
	 */
	agent.server.registerTool(
		'add_tag_to_entry',
		{
			title: 'Add Tag to Entry',
			description: 'Add a tag to an entry',
			annotations: {
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: entryTagIdSchema,
			outputSchema: { success: z.boolean(), entryTag: entryTagSchema },
		},
		async ({ entryId, tagId }) => {
			// Validate both tag and entry exist
			const tag = await agent.db.getTag(tagId)
			const entry = await agent.db.getEntry(entryId)
			invariant(tag, `Tag ${tagId} not found`)
			invariant(entry, `Entry with ID "${entryId}" not found`)
			
			// Create the relationship
			const entryTag = await agent.db.addTagToEntry({
				entryId,
				tagId,
			})
			
			const structuredContent = { success: true, entryTag }
			return {
				structuredContent,
				content: [
					createText(
						`Tag "${tag.name}" (ID: ${entryTag.tagId}) added to entry "${entry.title}" (ID: ${entryTag.entryId}) successfully`,
					),
					createTagResourceLink(tag),
					createEntryResourceLink(entry),
					createText(structuredContent),
				],
			}
		},
	)
}

/**
 * Tool Annotations Type - Defines the available annotations for MCP tools.
 * 
 * This type ensures type safety for tool annotations and enforces the correct
 * combination of hints based on MCP specifications.
 * 
 * Annotations:
 * - openWorldHint: Indicates if the tool can operate on arbitrary data (defaults to true)
 * - readOnlyHint: When true, indicates the tool only reads data (no other hints allowed)
 * - destructiveHint: Indicates if the tool can modify or delete data (defaults to true)
 * - idempotentHint: Indicates if calling the tool multiple times has the same effect (defaults to false)
 * 
 * The type uses discriminated unions to ensure only valid combinations are allowed.
 */
type ToolAnnotations = {
	// defaults to true, so only allow false
	openWorldHint?: false
} & (
	| {
			// when readOnlyHint is true, none of the other annotations can be changed
			readOnlyHint: true
	  }
	| {
			destructiveHint?: false // Only allow false (default is true)
			idempotentHint?: true // Only allow true (default is false)
	  }
)

/**
 * Create Text Content - Utility function to create text content for tool responses.
 * 
 * This function handles both string and object inputs, automatically converting
 * objects to JSON strings for display in tool responses.
 * 
 * @param text The text content to create (string or object)
 * @returns A CallToolResult content item with type 'text'
 */
function createText(text: unknown): CallToolResult['content'][number] {
	if (typeof text === 'string') {
		return { type: 'text', text }
	} else {
		return { type: 'text', text: JSON.stringify(text) }
	}
}

/**
 * Resource Link Content Type - Extracts resource link content from CallToolResult.
 * 
 * This type is used to ensure type safety when creating resource links
 * for entries and tags in tool responses.
 */
type ResourceLinkContent = Extract<
	CallToolResult['content'][number],
	{ type: 'resource_link' }
>

/**
 * Create Entry Resource Link - Creates a resource link for a journal entry.
 * 
 * This function creates a resource link that allows users to easily navigate
 * to and reference specific journal entries. The URI follows the epicme://
 * protocol for internal resource identification.
 * 
 * @param entry The entry object containing id and title
 * @returns A resource link content item for the entry
 */
function createEntryResourceLink(entry: {
	id: number
	title: string
}): ResourceLinkContent {
	return {
		type: 'resource_link',
		uri: `epicme://entries/${entry.id}`,
		name: entry.title,
		description: `Journal Entry: "${entry.title}"`,
		mimeType: 'application/json',
	}
}

/**
 * Create Tag Resource Link - Creates a resource link for a tag.
 * 
 * This function creates a resource link that allows users to easily navigate
 * to and reference specific tags. The URI follows the epicme:// protocol
 * for internal resource identification.
 * 
 * @param tag The tag object containing id and name
 * @returns A resource link content item for the tag
 */
function createTagResourceLink(tag: {
	id: number
	name: string
}): ResourceLinkContent {
	return {
		type: 'resource_link',
		uri: `epicme://tags/${tag.id}`,
		name: tag.name,
		description: `Tag: "${tag.name}"`,
		mimeType: 'application/json',
	}
}

/**
 * Elicit Confirmation - Requests user confirmation for destructive operations.
 * 
 * This function demonstrates how to request user confirmation before performing
 * destructive operations like deleting entries or tags. It uses the MCP
 * elicitation mechanism to prompt the user for confirmation.
 * 
 * Current Implementation Notes:
 * - Due to Cloudflare Workers limitations with elicitation support,
 *   this function currently returns true (auto-confirm) for all operations
 * - In a full implementation, this would prompt the user and wait for their response
 * - The function checks client capabilities before attempting elicitation
 * 
 * @param agent The MCP agent instance
 * @param message The confirmation message to display to the user
 * @returns Promise<boolean> - true if confirmed, false if rejected
 * 
 * @see https://github.com/modelcontextprotocol/typescript-sdk/issues/689
 */
async function elicitConfirmation(agent: EpicMeMCP, message: string) {
	const capabilities = agent.server.server.getClientCapabilities()
	// https://github.com/modelcontextprotocol/typescript-sdk/issues/689
	const cloudflareSupportsElicitation = false
	if (!capabilities?.elicitation || !cloudflareSupportsElicitation) {
		return true
	}

	const result = await agent.server.server.elicitInput({
		message,
		requestedSchema: {
			type: 'object',
			properties: {
				confirmed: {
					type: 'boolean',
					description: 'Whether to confirm the action',
				},
			},
		},
	})
	return result.action === 'accept' && result.content?.confirmed === true
}
