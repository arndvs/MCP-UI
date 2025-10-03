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

test('get remote dom for known tag id', async () => {
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
				mimeType:
					'application/vnd.mcp-ui.remote-dom+javascript; framework=react',
				text: expect.any(String),
			},
		},
	])
	const { resource } = z
		.object({ resource: z.object({ text: z.string() }) })
		.parse(content[0])

	expect(
		resource.text,
		'🚨 resource text does not contain "ui-stack"',
	).toContain('ui-stack')
	expect(resource.text, '🚨 resource text does not contain "coding"').toContain(
		'coding',
	)
	expect(
		resource.text,
		'🚨 resource text does not contain "document.createElement"',
	).toContain('document.createElement')
	expect(
		resource.text,
		'🚨 resource text does not contain "root.appendChild"',
	).toContain('root.appendChild')
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
				mimeType:
					'application/vnd.mcp-ui.remote-dom+javascript; framework=react',
				text: expect.stringMatching(/not found/i),
			},
		},
	])
	const { resource } = z
		.object({ resource: z.object({ text: z.string() }) })
		.parse(content[0])

	expect(
		resource.text,
		'🚨 resource text does not contain "ui-stack"',
	).toContain('ui-stack')
	expect(
		resource.text,
		'🚨 resource text does not contain "not found"',
	).toMatch(/not found/i)
	expect(
		resource.text,
		'🚨 resource text does not contain "document.createElement"',
	).toContain('document.createElement')
	expect(
		resource.text,
		'🚨 resource text does not contain "root.appendChild"',
	).toContain('root.appendChild')
})
