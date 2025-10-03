import { EpicMeMCP } from './mcp/index.ts'

export default {
	fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
		const url = new URL(request.url)

		if (url.pathname === '/mcp') {
			return EpicMeMCP.serve('/mcp', {
				binding: 'EPIC_ME_MCP_OBJECT',
			}).fetch(request, env, ctx)
		}

		if (url.pathname === '/healthcheck') {
			return new Response('OK', { status: 200 })
		}

		return new Response('Not found', { status: 404 })
	},
}

export { EpicMeMCP }
