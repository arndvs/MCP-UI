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

test('get raw html for known tag id', async () => {
	await using setup = await setupClient()
	const { client } = setup

	const result = await client
		.callTool({
			name: 'view_tag',
			arguments: {
				id: 1,
			},
		})
		.catch((e) => {
			throw new Error('🚨 view_tag tool call failed', { cause: e })
		})

	const content = z.array(z.unknown()).parse(result.content)

	expect(
		content,
		'🚨 content returned from view_tag tool does not match the expected format',
	).toEqual([
		{
			type: 'resource',
			resource: {
				uri: 'ui://view-tag/1',
				mimeType: 'text/html',
				text: expect.stringContaining('coding'),
			},
		},
	])
})

test('get raw html for unknown tag id', async () => {
	await using setup = await setupClient()
	const { client } = setup

	const result = await client
		.callTool({
			name: 'view_tag',
			arguments: {
				id: 999,
			},
		})
		.catch((e) => {
			throw new Error('🚨 view_tag tool call failed', { cause: e })
		})

	const content = z.array(z.unknown()).parse(result.content)

	expect(
		content,
		'🚨 content returned from view_tag tool does not match the expected format',
	).toEqual([
		{
			type: 'resource',
			resource: {
				uri: 'ui://view-tag/999',
				mimeType: 'text/html',
				text: expect.stringMatching(/not found/i),
			},
		},
	])
})
