import { Client } from '@modelcontextprotocol/sdk/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { test, expect, inject } from 'vitest'
import { z } from 'zod'

const mcpServerPort = inject('mcpServerPort')

async function setupClient() {
	const client = new Client(
		{
			name: 'EpicMeTester',
			version: '1.0.0',
		},
		{ capabilities: {} },
	)

	const transport = new StreamableHTTPClientTransport(
		new URL(`http://localhost:${mcpServerPort}/mcp`),
	)

	await client.connect(transport)

	return {
		client,
		async [Symbol.asyncDispose]() {
			await client.transport?.close()
		},
	}
}

test('view_journal sends iframe response', async () => {
	await using setup = await setupClient()
	const { client } = setup

	const result = await client.callTool({ name: 'view_journal' }).catch((e) => {
		throw new Error('🚨 view_journal tool call failed', { cause: e })
	})

	const content = z.array(z.unknown()).parse(result.content)

	expect(
		content,
		'🚨 content returned from view_journal tool does not match the expected format',
	).toEqual([
		{
			type: 'resource',
			resource: {
				uri: expect.stringMatching(/^ui:\/\/view-journal\/\d+$/),
				mimeType: 'text/uri-list',
				text: `http://localhost:${mcpServerPort}/ui/journal-viewer`,
			},
		},
	])
})
