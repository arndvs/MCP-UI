import { useState, useTransition, useRef } from 'react'
import {
	ErrorBoundary,
	useErrorBoundary,
	type FallbackProps,
} from 'react-error-boundary'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	useMcpUiInit,
	sendMcpMessage,
	waitForRenderData,
} from '#app/utils/mcp-solution.ts'
import { useDoubleCheck } from '#app/utils/misc.ts'
import { type Route } from './+types/entry-viewer.tsx'

/**
 * CLIENT LOADER - RENDER DATA IMPLEMENTATION
 * 
 * This loader demonstrates the secure render data pattern where entry data
 * is received from the MCP server via the render data mechanism instead of
 * being fetched directly from the database or passed via URL parameters.
 * 
 * RENDER DATA FLOW:
 * 1. MCP server tool includes entry data in uiMetadata['initial-render-data']
 * 2. Host application creates iframe and passes render data
 * 3. waitForRenderData() waits for 'ui-lifecycle-iframe-render-data' message
 * 4. Data is validated against schema and returned to component
 * 
 * SECURITY BENEFITS:
 * - No direct database access from client-side code
 * - Data is pre-authenticated by MCP server
 * - Prevents unauthorized access via URL manipulation
 * - Entry data is only available through authenticated tool calls
 * 
 * SCHEMA VALIDATION:
 * The renderDataSchema ensures we receive exactly the data structure we expect,
 * preventing runtime errors and ensuring type safety across the iframe boundary.
 */
export async function clientLoader() {
	// Define the expected structure of render data from MCP server
	const renderDataSchema = z.object({
		entry: z.object({
			id: z.number(),
			title: z.string(),
			content: z.string(),
			tags: z.array(z.object({ id: z.number(), name: z.string() })),
			mood: z.string().optional(),
			location: z.string().optional(),
			weather: z.string().optional(),
			createdAt: z.number(),
			updatedAt: z.number(),
		}),
	})
	
	// Wait for render data from parent frame (MCP host application)
	// This replaces direct database queries and URL parameter access
	const renderData = await waitForRenderData(renderDataSchema)
	return { entry: renderData.entry }
}

/**
 * HYDRATE FALLBACK - LOADING STATE
 * 
 * This component is displayed while waiting for render data to arrive from
 * the parent frame. It provides visual feedback that the component is
 * loading and prevents the UI from rendering with incomplete data.
 * 
 * IMPORTANT: This fallback is shown until waitForRenderData() resolves,
 * ensuring the component never renders without proper authentication data.
 */
export function HydrateFallback() {
	return (
		<div className="flex min-h-48 flex-col items-center justify-center py-12">
			<svg
				className="text-muted-foreground mb-4 h-8 w-8 animate-spin"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				aria-label="Loading"
			>
				<circle
					className="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					strokeWidth="4"
				/>
				<path
					className="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
				/>
			</svg>
			<p className="text-muted-foreground text-lg">
				Waiting for journal entries...
			</p>
		</div>
	)
}

/**
 * ENTRY VIEWER CONTENT - MAIN COMPONENT
 * 
 * This component renders the journal entry using data received via render data.
 * The entry data comes from the MCP server through the secure render data
 * mechanism, ensuring it's properly authenticated and authorized.
 * 
 * KEY FEATURES:
 * - Displays entry title, content, tags, and metadata
 * - Handles entry deletion with confirmation
 * - Manages iframe lifecycle communication
 * - Shows appropriate states (loading, deleted, error)
 * 
 * SECURITY: All entry data is pre-authenticated by the MCP server
 * before being passed to this component via render data.
 */
export default function EntryViewerContent({
	loaderData,
}: Route.ComponentProps) {
	const { entry } = loaderData
	const [isDeleted, setIsDeleted] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)

	// Initialize MCP UI communication with parent frame
	useMcpUiInit(rootRef)

	if (isDeleted) {
		return (
			<div
				ref={rootRef}
				className="bg-background max-h-[800px] overflow-y-auto p-4"
			>
				<div className="mx-auto max-w-4xl">
					<div className="bg-card mb-6 rounded-xl border p-6 shadow-lg">
						<h1 className="text-foreground text-3xl font-bold">
							Entry Deleted
						</h1>
						<p className="text-muted-foreground mb-4">
							Entry deleted successfully
						</p>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div
			ref={rootRef}
			className="bg-background max-h-[800px] overflow-y-auto p-4"
		>
			<div className="mx-auto max-w-4xl">
				<div className="bg-card mb-6 rounded-xl border p-6 shadow-lg">
					<div className="mb-4 flex items-center justify-between">
						<h1 className="text-foreground text-3xl font-bold">
							{entry.title}
						</h1>
					</div>

					<div className="mb-4 flex flex-wrap gap-2">
						{entry.tags.length > 0 ? (
							entry.tags.map((tag) => (
								<span
									key={tag.id}
									className="bg-accent text-accent-foreground rounded-full px-3 py-1 text-sm"
								>
									🏷️ {tag.name}
								</span>
							))
						) : (
							<span className="text-muted-foreground text-sm">No tags</span>
						)}
					</div>

					<div className="mb-4 flex flex-wrap gap-6">
						{entry.mood && (
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground text-sm">💭</span>
								<span className="text-foreground text-sm font-medium">
									{entry.mood}
								</span>
							</div>
						)}
						{entry.location && (
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground text-sm">📍</span>
								<span className="text-foreground text-sm font-medium">
									{entry.location}
								</span>
							</div>
						)}
						{entry.weather && (
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground text-sm">🌤️</span>
								<span className="text-foreground text-sm font-medium">
									{entry.weather}
								</span>
							</div>
						)}
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-sm">📅</span>
							<span className="text-muted-foreground text-sm font-medium">
								Created: {new Date(entry.createdAt * 1000).toLocaleDateString()}
							</span>
						</div>
						{entry.updatedAt !== entry.createdAt && (
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground text-sm">✏️</span>
								<span className="text-muted-foreground text-sm font-medium">
									Updated:{' '}
									{new Date(entry.updatedAt * 1000).toLocaleDateString()}
								</span>
							</div>
						)}
					</div>
				</div>

				<div className="bg-card rounded-xl border p-6 shadow-lg">
					<h2 className="text-foreground mb-4 text-xl font-semibold">
						Content
					</h2>
					<div className="text-foreground whitespace-pre-wrap">
						{entry.content}
					</div>
				</div>

				<div className="mt-6">
					<DeleteEntryButton
						entry={entry}
						onDeleted={() => setIsDeleted(true)}
					/>
				</div>
			</div>
		</div>
	)
}

/**
 * DELETE ENTRY BUTTON - WRAPPER WITH ERROR BOUNDARY
 * 
 * This component wraps the delete functionality with an error boundary
 * to handle any failures during the deletion process gracefully.
 * 
 * SECURITY: The delete operation is performed via MCP message to the
 * parent frame, which then calls the authenticated MCP server tool.
 */
function DeleteEntryButton({
	entry,
	onDeleted,
}: {
	entry: { id: number; title: string }
	onDeleted: () => void
}) {
	return (
		<ErrorBoundary FallbackComponent={DeleteEntryError}>
			<DeleteEntryButtonImpl entry={entry} onDeleted={onDeleted} />
		</ErrorBoundary>
	)
}

function DeleteEntryError({ error, resetErrorBoundary }: FallbackProps) {
	return (
		<div className="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border p-3">
			<p className="text-sm font-medium">Failed to delete entry</p>
			<p className="text-destructive/80 text-xs">{error.message}</p>
			<button
				onClick={resetErrorBoundary}
				className="text-destructive mt-2 cursor-pointer text-xs hover:underline"
			>
				Try again
			</button>
		</div>
	)
}

/**
 * DELETE ENTRY BUTTON IMPLEMENTATION
 * 
 * This component handles the actual deletion logic with double-check confirmation
 * and communicates with the MCP server via the parent frame.
 * 
 * MCP COMMUNICATION FLOW:
 * 1. User clicks delete button (requires double-check)
 * 2. Component sends 'tool' message to parent frame
 * 3. Parent frame forwards to MCP server
 * 4. MCP server performs authenticated deletion
 * 5. Response is sent back through the message chain
 * 
 * SECURITY: All operations go through the authenticated MCP server,
 * preventing unauthorized deletions.
 */
function DeleteEntryButtonImpl({
	entry,
	onDeleted,
}: {
	entry: { id: number; title: string }
	onDeleted: () => void
}) {
	const [isPending, startTransition] = useTransition()
	const { doubleCheck, getButtonProps } = useDoubleCheck()
	const { showBoundary } = useErrorBoundary()

	const handleDelete = () => {
		if (!doubleCheck) return

		startTransition(async () => {
			try {
				// Send delete request via MCP message to parent frame
				await sendMcpMessage('tool', {
					toolName: 'delete_entry',
					params: { id: entry.id },
				})
				onDeleted()
			} catch (err) {
				showBoundary(err)
			}
		})
	}

	return (
		<button
			{...getButtonProps({
				onClick: doubleCheck ? handleDelete : undefined,
				disabled: isPending,
				className: `px-4 py-2 rounded-lg border transition-colors font-medium ${
					doubleCheck
						? 'bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90'
						: 'text-destructive border-destructive/20 hover:bg-destructive/10 hover:border-destructive/40'
				} ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`,
			})}
		>
			{isPending ? 'Deleting...' : doubleCheck ? 'Confirm?' : 'Delete Entry'}
		</button>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
