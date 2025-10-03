import { useEffect } from 'react'

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

export function sendLinkMcpMessage(url: string) {
	const messageId = crypto.randomUUID()

	return new Promise((resolve, reject) => {
		window.parent.postMessage(
			{ type: 'link', messageId, payload: { url } },
			'*',
		)

		function handleMessage(event: MessageEvent) {
			if (event.data.type !== 'ui-message-response') return
			if (event.data.messageId !== messageId) return
			window.removeEventListener('message', handleMessage)

			const { response, error } = event.data.payload

			if (error) return reject(error)

			return resolve(response)
		}

		window.addEventListener('message', handleMessage)
	})
}
