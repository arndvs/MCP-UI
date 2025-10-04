import { useEffect } from 'react'
import { type z } from 'zod'

/**
 * Initializes MCP UI communication with the parent iframe
 * This hook handles the initial handshake and sizing communication
 * between the child iframe (our UI) and the parent iframe (the MCP agent)
 */
export function useMcpUiInit(rootRef: React.RefObject<HTMLDivElement | null>) {
	useEffect(() => {
		// Signal to parent that the iframe is ready for communication
		window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*')
		if (!rootRef.current) return

		// Send initial dimensions to parent for proper sizing
		const height = rootRef.current.clientHeight
		const width = rootRef.current.clientWidth

		window.parent.postMessage(
			{ type: 'ui-size-change', payload: { height, width } },
			'*',
		)
	}, [rootRef])
}

/**
 * Configuration options for MCP messages
 * schema: Optional Zod schema for response validation and type safety
 */
type MessageOptions = { schema?: z.ZodSchema }

/**
 * Return type for MCP messages based on whether a schema is provided
 * If schema is provided, returns the inferred type from the schema
 * Otherwise, returns unknown
 */
type McpMessageReturnType<Options> = Promise<
	Options extends { schema: z.ZodSchema } ? z.infer<Options['schema']> : unknown
>

/**
 * Defines the structure of different MCP message types
 * - tool: For calling MCP tools with a tool name and parameters
 * - link: For opening links in the parent context
 */
type McpMessageTypes = {
	tool: { toolName: string; params: Record<string, unknown> }
	link: { url: string }
}

type McpMessageType = keyof McpMessageTypes

/**
 * Function overload for sending tool messages to the MCP agent
 * This allows type-safe tool calling with proper parameter validation
 */
function sendMcpMessage<Options extends MessageOptions>(
	type: 'tool',
	payload: McpMessageTypes['tool'],
	options?: Options,
): McpMessageReturnType<Options>

/**
 * Function overload for sending link messages to the MCP agent
 * This allows opening URLs in the parent context
 */
function sendMcpMessage<Options extends MessageOptions>(
	type: 'link',
	payload: McpMessageTypes['link'],
	options?: Options,
): McpMessageReturnType<Options>

/**
 * Main implementation of sendMcpMessage
 * 
 * This function handles communication between the child iframe (our UI) and the parent iframe (MCP agent).
 * The communication pattern is:
 * 1. Generate a unique message ID
 * 2. Send a postMessage to the parent with the message type, ID, and payload
 * 3. Listen for a response with the same message ID
 * 4. Resolve with the response data or reject with any errors
 * 5. Optionally validate the response against a provided Zod schema
 * 
 * @param type - The type of MCP message ('tool' or 'link')
 * @param payload - The message payload specific to the message type
 * @param options - Optional configuration including schema validation
 * @returns Promise that resolves to the response data or rejects with an error
 */
function sendMcpMessage(
	type: McpMessageType,
	payload: McpMessageTypes[McpMessageType],
	options: MessageOptions = {},
): McpMessageReturnType<typeof options> {
	const { schema } = options
	// Generate unique ID to match request with response
	const messageId = crypto.randomUUID()

	return new Promise((resolve, reject) => {
		// Check if we're running in an iframe with a parent
		if (!window.parent || window.parent === window) {
			console.log(`[MCP] No parent frame available. Would have sent message:`, {
				type,
				messageId,
				payload,
			})
			reject(new Error('No parent frame available'))
			return
		}

		// Send message to parent iframe (MCP agent)
		window.parent.postMessage({ type, messageId, payload }, '*')

		// Handle response from parent iframe
		function handleMessage(event: MessageEvent) {
			// Only process responses to our specific message
			if (event.data.type !== 'ui-message-response') return
			if (event.data.messageId !== messageId) return
			
			// Clean up event listener
			window.removeEventListener('message', handleMessage)

			const { response, error } = event.data.payload

			// Handle errors from the MCP agent
			if (error) return reject(error)
			
			// If no schema provided, return raw response
			if (!schema) return resolve(response)

			// Validate response against schema for type safety
			const parseResult = schema.safeParse(response)
			if (!parseResult.success) return reject(parseResult.error)

			return resolve(parseResult.data)
		}

		// Listen for response from parent
		window.addEventListener('message', handleMessage)
	})
}

export { sendMcpMessage }
