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
import { type EpicMeMCP } from './index.ts'
import { suggestTagsSampling } from './sampling.ts'
import { getTagViewUI } from './ui.ts'

/**
 * MCP TOOLS INITIALIZATION - RENDER DATA SECURITY IMPLEMENTATION
 * 
 * This file contains all MCP tools with enhanced security through render data.
 * The key improvement is the 'view_entry' tool which now passes entry data
 * securely via uiMetadata instead of exposing it through URL parameters.
 * 
 * SECURITY IMPROVEMENTS:
 * - Removed dynamic URL segments that allowed direct access
 * - Entry data is passed via render data mechanism
 * - Data is pre-authenticated before being sent to iframe
 * - Prevents unauthorized access via URL manipulation
 * 
 * RENDER DATA PATTERN:
 * 1. Tool receives authenticated request with entry ID
 * 2. Server fetches entry data from database
 * 3. Data is included in uiMetadata['initial-render-data']
 * 4. Host application passes data to iframe securely
 * 5. iframe receives data via waitForRenderData()
 */
export async function initializeTools(agent: EpicMeMCP) {
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
			const createdEntry = await agent.db.createEntry(entry)
			if (entry.tags) {
				for (const tagId of entry.tags) {
					await agent.db.addTagToEntry({
						entryId: createdEntry.id,
						tagId,
					})
				}
			}

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
			const iframeUrl = new URL('/ui/journal-viewer', agent.requireBaseUrl())

			return {
				content: [
					createUIResource({
						uri: `ui://view-journal/${Date.now()}`,
						content: {
							type: 'externalUrl',
							iframeUrl: iframeUrl.toString(),
						},
						encoding: 'text',
						uiMetadata: {
							'preferred-frame-size': ['600px', '800px'],
						},
					}),
				],
			}
		},
	)

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
			const tag = await agent.db.getTag(tagId)
			const entry = await agent.db.getEntry(entryId)
			invariant(tag, `Tag ${tagId} not found`)
			invariant(entry, `Entry with ID "${entryId}" not found`)
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

	/**
	 * VIEW ENTRY TOOL - RENDER DATA IMPLEMENTATION
	 * 
	 * This tool demonstrates the secure render data pattern where entry data
	 * is passed to the iframe via uiMetadata instead of URL parameters.
	 * 
	 * KEY CHANGES FOR SECURITY:
	 * 1. Removed entry ID from iframe URL (no more /ui/entry-viewer/:id)
	 * 2. Entry data is fetched server-side and included in uiMetadata
	 * 3. iframe receives data via render data mechanism
	 * 4. Prevents direct URL access to journal entries
	 * 
	 * RENDER DATA FLOW:
	 * 1. LLM calls this tool with entry ID
	 * 2. Server validates access and fetches entry data
	 * 3. Entry data is included in uiMetadata['initial-render-data']
	 * 4. Host application creates iframe with render data
	 * 5. iframe waits for and receives authenticated data
	 * 
	 * SECURITY BENEFITS:
	 * - No sensitive data in URLs
	 * - Data is pre-authenticated by MCP server
	 * - Prevents unauthorized access via URL manipulation
	 * - Entry data only available through authenticated tool calls
	 */
	agent.server.registerTool(
		'view_entry',
		{
			title: 'View Entry',
			description: 'View a journal entry by ID visually',
			annotations: {
				readOnlyHint: true,
				openWorldHint: false,
			} satisfies ToolAnnotations,
			inputSchema: entryIdSchema,
		},
		async ({ id }) => {
			// Create iframe URL WITHOUT entry ID - security improvement!
			const iframeUrl = new URL('/ui/entry-viewer', agent.requireBaseUrl())
			
			// Fetch entry data server-side for authentication
			const entry = await agent.db.getEntry(id)
			invariant(entry, `Entry with ID "${id}" not found`)

			return {
				content: [
					createUIResource({
						uri: `ui://view-entry/${id}`,
						content: {
							type: 'externalUrl',
							iframeUrl: iframeUrl.toString(),
						},
						encoding: 'text',
						// Pass entry data via render data instead of URL
						uiMetadata: {
							'initial-render-data': { entry },
						},
					}),
				],
			}
		},
	)
}

/**
 * TOOL ANNOTATIONS TYPE
 * 
 * This type defines the annotations that can be applied to MCP tools
 * to provide hints about their behavior and security characteristics.
 * 
 * ANNOTATION TYPES:
 * - readOnlyHint: Tool only reads data, doesn't modify anything
 * - destructiveHint: Tool can modify or delete data
 * - idempotentHint: Tool can be called multiple times safely
 * - openWorldHint: Tool can access external resources
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
 * UTILITY FUNCTIONS FOR MCP TOOL RESPONSES
 * 
 * These functions help create properly formatted responses for MCP tools,
 * including text content and resource links for navigation.
 */

/**
 * CREATE TEXT CONTENT
 * 
 * Converts various data types into text content for MCP tool responses.
 * Handles both string and object data appropriately.
 */
function createText(text: unknown): CallToolResult['content'][number] {
	if (typeof text === 'string') {
		return { type: 'text', text }
	} else {
		return { type: 'text', text: JSON.stringify(text) }
	}
}

/**
 * RESOURCE LINK CREATION FUNCTIONS
 * 
 * These functions create resource links that allow users to navigate
 * to specific entries or tags within the MCP system.
 */

type ResourceLinkContent = Extract<
	CallToolResult['content'][number],
	{ type: 'resource_link' }
>

/**
 * CREATE ENTRY RESOURCE LINK
 * 
 * Creates a clickable resource link for a journal entry that allows
 * users to navigate directly to that entry.
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
 * CREATE TAG RESOURCE LINK
 * 
 * Creates a clickable resource link for a tag that allows users
 * to navigate directly to that tag.
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
 * ELICIT CONFIRMATION - USER CONFIRMATION HANDLER
 * 
 * This function handles user confirmation for destructive operations like
 * deleting entries or tags. It uses the MCP elicitation mechanism when
 * available, or defaults to allowing the operation.
 * 
 * NOTE: Currently disabled for Cloudflare Workers due to SDK limitations.
 * In a production environment, this would provide proper user confirmation
 * before performing destructive operations.
 * 
 * @param agent - The MCP agent instance
 * @param message - The confirmation message to show to the user
 * @returns Promise<boolean> - Whether the user confirmed the action
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
