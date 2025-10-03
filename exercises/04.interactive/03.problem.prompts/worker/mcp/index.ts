import { type DBClient } from '@epic-web/epicme-db-client'
import { invariant } from '@epic-web/invariant'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { McpAgent } from 'agents/mcp'
import { db } from '../db.ts'
import { initializePrompts } from './prompts.ts'
import { initializeResources } from './resources.ts'
import { initializeTools } from './tools.ts'

export type Props = { baseUrl: string }
type State = {}

export class EpicMeMCP extends McpAgent<Env, State, Props> {
	db!: DBClient
	server = new McpServer(
		{
			name: 'epicme',
			title: 'EpicMe Journal',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: { listChanged: true },
				resources: { listChanged: true, subscribe: true },
				completions: {},
				logging: {},
				prompts: { listChanged: true },
			},
			instructions: `
EpicMe is a journaling app that allows users to write about and review their experiences, thoughts, and reflections.

These tools are the user's window into their journal. With these tools and your help, they can create, read, and manage their journal entries and associated tags.

You can also help users add tags to their entries and get all tags for an entry.
			`.trim(),
		},
	)

	async init() {
		this.db = db
		await initializeTools(this)
		await initializeResources(this)
		await initializePrompts(this)
	}
	requireBaseUrl() {
		const baseUrl = this.props?.baseUrl
		invariant(baseUrl, 'Unexpected: baseUrl not set on agent')
		return baseUrl
	}
}
