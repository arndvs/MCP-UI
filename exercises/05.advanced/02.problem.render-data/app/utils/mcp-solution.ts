import { useEffect } from 'react'
import { type z } from 'zod'

/**
 * MCP UI INITIALIZATION HOOK
 * 
 * This hook handles the initial communication between the iframe and its parent frame.
 * It sends lifecycle events and size information to enable proper iframe management.
 * 
 * COMMUNICATION EVENTS:
 * - 'ui-lifecycle-iframe-ready': Signals that the iframe is ready to receive data
 * - 'ui-size-change': Provides dimensions for proper iframe sizing
 */
export function useMcpUiInit(rootRef: React.RefObject<HTMLDivElement | null>) {
	useEffect(() => {
		// Signal to parent that iframe is ready to receive render data
		window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*')
		if (!rootRef.current) return

		const height = rootRef.current.clientHeight
		const width = rootRef.current.clientWidth

		// Send size information to parent for proper iframe sizing
		window.parent.postMessage(
			{ type: 'ui-size-change', payload: { height, width } },
			'*',
		)
	}, [rootRef])
}

/**
 * MESSAGE COMMUNICATION TYPES
 * 
 * These types define the structure for MCP message communication between
 * the iframe and its parent frame. They ensure type safety for all
 * message exchanges.
 */
type MessageOptions = { schema?: z.ZodSchema }

type McpMessageReturnType<Options> = Promise<
	Options extends { schema: z.ZodSchema } ? z.infer<Options['schema']> : unknown
>

type McpMessageTypes = {
	tool: { toolName: string; params: Record<string, unknown> }
	prompt: { prompt: string }
	link: { url: string }
}

type McpMessageType = keyof McpMessageTypes

/**
 * SEND MCP MESSAGE - FUNCTION OVERLOADS
 * 
 * These overloads provide type-safe interfaces for different message types.
 * Each overload ensures the correct payload structure and return type.
 */
function sendMcpMessage<Options extends MessageOptions>(
	type: 'tool',
	payload: McpMessageTypes['tool'],
	options?: Options,
): McpMessageReturnType<Options>

function sendMcpMessage<Options extends MessageOptions>(
	type: 'prompt',
	payload: McpMessageTypes['prompt'],
	options?: Options,
): McpMessageReturnType<Options>

function sendMcpMessage<Options extends MessageOptions>(
	type: 'link',
	payload: McpMessageTypes['link'],
	options?: Options,
): McpMessageReturnType<Options>

function sendMcpMessage<Options extends MessageOptions>(
	type: 'link',
	payload: McpMessageTypes['link'],
	options?: Options,
): McpMessageReturnType<Options>

/**
 * SEND MCP MESSAGE - IMPLEMENTATION
 * 
 * This function handles sending messages from the iframe to its parent frame
 * and waiting for responses. It includes proper error handling and schema validation.
 * 
 * MESSAGE FLOW:
 * 1. Generate unique message ID
 * 2. Send message to parent frame
 * 3. Listen for response with matching ID
 * 4. Validate response against schema (if provided)
 * 5. Return parsed data or reject with error
 * 
 * SECURITY: All communication goes through the parent frame, which
 * acts as a proxy to the authenticated MCP server.
 */
function sendMcpMessage(
	type: McpMessageType,
	payload: McpMessageTypes[McpMessageType],
	options: MessageOptions = {},
): McpMessageReturnType<typeof options> {
	const { schema } = options
	const messageId = crypto.randomUUID()

	return new Promise((resolve, reject) => {
		// Check if we're in an iframe context
		if (!window.parent || window.parent === window) {
			console.log(`[MCP] No parent frame available. Would have sent message:`, {
				type,
				messageId,
				payload,
			})
			reject(new Error('No parent frame available'))
			return
		}

		// Send message to parent frame
		window.parent.postMessage({ type, messageId, payload }, '*')

		function handleMessage(event: MessageEvent) {
			// Only process responses to our specific message
			if (event.data.type !== 'ui-message-response') return
			if (event.data.messageId !== messageId) return
			window.removeEventListener('message', handleMessage)

			const { response, error } = event.data.payload

			// Handle errors from parent frame
			if (error) return reject(error)
			
			// Return raw response if no schema validation needed
			if (!schema) return resolve(response)

			// Validate response against schema
			const parseResult = schema.safeParse(response)
			if (!parseResult.success) return reject(parseResult.error)

			return resolve(parseResult.data)
		}

		window.addEventListener('message', handleMessage)
	})
}

export { sendMcpMessage }

/**
 * WAIT FOR RENDER DATA - CORE RENDER DATA IMPLEMENTATION
 * 
 * This is the key function that implements the render data pattern for secure
 * data passing from MCP server to iframe components. It replaces direct
 * database access and URL parameter usage with authenticated data flow.
 * 
 * RENDER DATA FLOW:
 * 1. MCP server tool includes data in uiMetadata['initial-render-data']
 * 2. Host application creates iframe and stores render data
 * 3. iframe sends 'ui-lifecycle-iframe-ready' message
 * 4. Host responds with 'ui-lifecycle-iframe-render-data' message
 * 5. Data is validated against schema and returned
 * 
 * SECURITY BENEFITS:
 * - Data is pre-authenticated by MCP server
 * - No direct database access from client
 * - Prevents URL manipulation attacks
 * - Schema validation ensures data integrity
 * 
 * TYPE SAFETY:
 * - Generic type parameter ensures return type matches schema
 * - Zod schema validation provides runtime type checking
 * - TypeScript inference works seamlessly with the generic
 * 
 * @param schema - Zod schema to validate the render data structure
 * @returns Promise that resolves to validated render data
 */
export function waitForRenderData<RenderData>(
	schema: z.ZodSchema<RenderData>,
): Promise<RenderData> {
	return new Promise((resolve, reject) => {
		// Signal to parent that we're ready to receive render data
		// This triggers the host application to send the stored render data
		window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*')

		function handleMessage(event: MessageEvent) {
			// Only process render data messages
			if (event.data?.type !== 'ui-lifecycle-iframe-render-data') return
			window.removeEventListener('message', handleMessage)

			const { renderData, error } = event.data.payload

			// Handle errors from parent frame
			if (error) return reject(error)
			
			// Return raw data if no schema validation needed
			if (!schema) return resolve(renderData)

			// Validate render data against provided schema
			const parseResult = schema.safeParse(renderData)
			if (!parseResult.success) return reject(parseResult.error)

			return resolve(parseResult.data)
		}

		// Listen for render data from parent frame
		window.addEventListener('message', handleMessage)
	})
}
