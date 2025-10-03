import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
	index('routes/index.tsx'),
	route('healthcheck', 'routes/healthcheck.tsx'),
	route('ui/journal-viewer', 'routes/ui/journal-viewer.tsx'),
	// 🐨 get rid of the :entryId dynamic segment here (we get the entry data from renderData now)
	route('ui/entry-viewer/:entryId', 'routes/ui/entry-viewer.tsx'),
	route('/*', 'routes/catch-all.tsx'),
] satisfies RouteConfig
