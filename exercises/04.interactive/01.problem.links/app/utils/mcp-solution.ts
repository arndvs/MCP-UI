import { useEffect } from 'react'

/**
 * Initializes MCP UI communication with the parent window.
 * 
 * This hook handles the initial setup for iframe-based MCP UI components:
 * 1. Notifies the parent that the iframe is ready
 * 2. Sends the initial dimensions of the iframe content
 * 
 * @param rootRef - React ref pointing to the root container element
 */
export function useMcpUiInit(rootRef: React.RefObject<HTMLDivElement | null>) {
	useEffect(() => {
		// Notify parent that iframe is ready for communication
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
 * Sends a link navigation request to the parent window via MCP communication.
 * 
 * This function enables iframe-based UI components to navigate to external URLs
 * by communicating with the host application. Since iframes cannot directly navigate
 * their parent window, this pattern allows seamless navigation while maintaining
 * control over the user experience.
 * 
 * Communication Pattern:
 * 1. Generate unique message ID for request/response correlation
 * 2. Send 'link' type message to parent with URL payload
 * 3. Listen for 'ui-message-response' with matching message ID
 * 4. Clean up event listener and resolve/reject based on response
 * 
 * @param url - The URL to navigate to (e.g., 'https://x.com/intent/post')
 * @returns Promise that resolves when navigation succeeds or rejects on error
 * 
 * @example
 * ```tsx
 * const handlePostOnX = async () => {
 *   try {
 *     const url = 'https://x.com/intent/post?text=Hello World'
 *     await sendLinkMcpMessage(url)
 *     // Navigation successful
 *   } catch (error) {
 *     // Handle navigation error
 *   }
 * }
 * ```
 */
export function sendLinkMcpMessage(url: string) {
	// Generate unique identifier to correlate request with response
	// This prevents race conditions when multiple requests are sent simultaneously
	const messageId = crypto.randomUUID()

	return new Promise((resolve, reject) => {
		// Send link navigation request to parent window
		window.parent.postMessage(
			{ 
				type: 'link',           // Message type indicating link navigation request
				messageId,              // Unique ID for request correlation
				payload: { url }        // URL to navigate to
			},
			'*',                        // Target origin: '*' allows any parent origin
		)

		/**
		 * Handles response messages from the parent window.
		 * Filters for responses matching our specific request ID.
		 */
		function handleMessage(event: MessageEvent) {
			// Only process 'ui-message-response' type messages
			if (event.data.type !== 'ui-message-response') return
			
			// Only process responses matching our request ID
			if (event.data.messageId !== messageId) return
			
			// Clean up: remove event listener to prevent memory leaks
			window.removeEventListener('message', handleMessage)

			// Extract response data from parent
			const { response, error } = event.data.payload

			// Handle error case: reject promise with error details
			if (error) return reject(error)

			// Handle success case: resolve with response data
			return resolve(response)
		}

		// Listen for response messages from parent window
		window.addEventListener('message', handleMessage)
	})
}
