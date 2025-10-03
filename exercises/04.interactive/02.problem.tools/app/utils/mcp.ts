import { useEffect } from 'react'
import { type z } from 'zod'

export function useMcpUiInit(rootRef: React.RefObject<HTMLDivElement | null>) {
	useEffect(() => {
		window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*')
		if (!rootRef.current) return

		const height = rootRef.current.clientHeight
		const width = rootRef.current.clientWidth

		window.parent.postMessage(
			{ type: 'ui-size-change', payload: { height, width } },
			'*',
		)
	}, [rootRef])
}

type MessageOptions = { schema?: z.ZodSchema }

type McpMessageReturnType<Options> = Promise<
	Options extends { schema: z.ZodSchema } ? z.infer<Options['schema']> : unknown
>

type McpMessageTypes = {
	// 🐨 add support for a 'tool' type which has a payload of { toolName: string; params: Record<string, unknown> }
	link: { url: string }
}

type McpMessageType = keyof McpMessageTypes

// 🐨 add another override for the 'tool' type
// 💰 it should have the same signature as the 'link' type (except the type is 'tool')

function sendMcpMessage<Options extends MessageOptions>(
	type: 'link',
	payload: McpMessageTypes['link'],
	options?: Options,
): McpMessageReturnType<Options>

function sendMcpMessage(
	type: McpMessageType,
	payload: McpMessageTypes[McpMessageType],
	options: MessageOptions = {},
): McpMessageReturnType<typeof options> {
	const { schema } = options
	const messageId = crypto.randomUUID()

	return new Promise((resolve, reject) => {
		if (!window.parent || window.parent === window) {
			console.log(`[MCP] No parent frame available. Would have sent message:`, {
				type,
				messageId,
				payload,
			})
			reject(new Error('No parent frame available'))
			return
		}

		window.parent.postMessage({ type, messageId, payload }, '*')

		function handleMessage(event: MessageEvent) {
			if (event.data.type !== 'ui-message-response') return
			if (event.data.messageId !== messageId) return
			window.removeEventListener('message', handleMessage)

			const { response, error } = event.data.payload

			if (error) return reject(error)
			if (!schema) return resolve(response)

			const parseResult = schema.safeParse(response)
			if (!parseResult.success) return reject(parseResult.error)

			return resolve(parseResult.data)
		}

		window.addEventListener('message', handleMessage)
	})
}

export { sendMcpMessage }
