import { invariant } from '@epic-web/invariant'
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

test('view_journal includes uiMetadata', async () => {
	await using setup = await setupClient()
	const { client } = setup

	const result = await client.callTool({ name: 'view_journal' }).catch((e) => {
		throw new Error('🚨 view_journal tool call failed', { cause: e })
	})

	invariant(Array.isArray(result.content), '🚨 content is not an array')

	const content = z
		.object({
			resource: z.object({
				_meta: z.any().optional(),
			}),
		})
		.parse(result.content[0])

	expect(
		content.resource._meta,
		`🚨 _meta is not present or is not the correct format, make sure to set uiMetadata and include a 'preferred-frame-size' property`,
	).toEqual({
		'mcpui.dev/ui-preferred-frame-size': [
			expect.stringMatching(/^\d+px$/),
			expect.stringMatching(/^\d+px$/),
		],
	})
})
