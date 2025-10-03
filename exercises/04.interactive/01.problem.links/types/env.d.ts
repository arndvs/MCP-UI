// ensure the module is in the program so the merge hits
import { type DBClient } from '@epic-web/epicme-db-client'
import 'cloudflare:workers'

declare module 'react-router' {
	export interface AppLoadContext {
		db: DBClient
		cloudflare: {
			env: Env
			ctx: ExecutionContext
		}
	}
}
