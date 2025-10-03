// we're doing this to get around the vite lazy dependency optimization for tests
// it's super annoying, but what are you gonna do?

import * as react from 'react'
import * as errorBoundary from 'react-error-boundary'
import * as misc from '#app/utils/misc.ts'
import { type Route } from './+types/healthcheck.tsx'

export async function loader({ context }: Route.LoaderArgs) {
	await context.db.getEntries()
	return { ok: true }
}

export default function Healthcheck() {
	react.useEffect(() => {
		console.log({ react, errorBoundary, misc })
	}, [])
	return <div>Healthcheck</div>
}
