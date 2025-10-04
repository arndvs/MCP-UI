import { useState, useTransition, useRef } from 'react'
import {
	ErrorBoundary,
	useErrorBoundary,
	type FallbackProps,
} from 'react-error-boundary'
import { useMcpUiInit, sendMcpMessage } from '#app/utils/mcp-solution.ts'
import { useDoubleCheck } from '#app/utils/misc.ts'
import { type Route } from './+types/journal-viewer.tsx'

/**
 * Loader function that fetches journal entries from the database
 * This runs on the server and provides initial data to the component
 */
export async function loader({ context }: Route.LoaderArgs) {
	const entries = await context.db.getEntries()
	return { entries }
}

/**
 * Main Journal Viewer component
 * 
 * This component displays a list of journal entries with interactive buttons
 * for viewing, summarizing, and deleting entries. It uses MCP (Model Context Protocol)
 * to communicate with the parent iframe (MCP agent) for tool calling functionality.
 * 
 * Key features:
 * - Displays journal entries with metadata (title, tag count)
 * - Provides buttons for MCP tool interactions (view, summarize, delete)
 * - Handles optimistic UI updates for deleted entries
 * - Uses ErrorBoundary for graceful error handling
 * - Integrates with MCP UI for iframe communication
 */
export default function JournalViewer({ loaderData }: Route.ComponentProps) {
	const { entries } = loaderData
	
	// Track which entries have been deleted for optimistic UI updates
	const [deletedEntryIds, setDeletedEntryIds] = useState<Set<number>>(
		() => new Set([]),
	)
	
	// Ref for the root container - needed for MCP UI initialization
	const rootRef = useRef<HTMLDivElement>(null)
	
	// Initialize MCP UI communication with parent iframe
	useMcpUiInit(rootRef)

	/**
	 * Handles optimistic UI update when an entry is deleted
	 * This immediately updates the UI to show the entry as deleted
	 * while the actual deletion happens in the background
	 */
	const handleEntryDeleted = (entryId: number) => {
		setDeletedEntryIds((prev) => new Set([...prev, entryId]))
	}

	return (
		<div
			ref={rootRef}
			className="bg-background max-h-[800px] overflow-y-auto p-4"
		>
			<div className="mx-auto max-w-4xl">
				<div className="bg-card mb-6 rounded-xl border p-6 shadow-lg">
					<h1 className="text-foreground mb-2 text-3xl font-bold">
						Your Journal
					</h1>
					<p className="text-muted-foreground mb-4">
						You have {entries.length} journal{' '}
						{entries.length === 1 ? 'entry' : 'entries'}
					</p>
					<XPostLink entryCount={entries.length} />
				</div>

				{entries.length === 0 ? (
					<div className="bg-card rounded-xl border p-8 text-center shadow-lg">
						<div
							className="mb-4 text-6xl"
							role="img"
							aria-label="Empty journal"
						>
							📝
						</div>
						<h2 className="text-foreground mb-2 text-xl font-semibold">
							No Journal Entries Yet
						</h2>
						<p className="text-muted-foreground">
							Start writing your thoughts and experiences to see them here.
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{entries.map((entry) => {
							const isDeleted = deletedEntryIds.has(entry.id)
							return (
								<div
									key={entry.id}
									className={`bg-card rounded-xl border p-6 shadow-sm transition-all ${
										isDeleted ? 'bg-muted/50 opacity-50' : 'hover:shadow-md'
									}`}
								>
									<div className="flex items-start justify-between">
										<div className="flex-1">
											<div className="mb-3 flex items-center gap-3">
												<h3 className="text-foreground text-lg font-semibold">
													{entry.title}
												</h3>
												{isDeleted ? (
													<div className="text-accent-foreground bg-accent flex items-center gap-2 rounded-md px-2 py-1 text-sm">
														<svg
															className="h-3 w-3"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
															xmlns="http://www.w3.org/2000/svg"
														>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
																d="M5 13l4 4L19 7"
															/>
														</svg>
														Deleted
													</div>
												) : null}
											</div>

											<div className="mb-3 flex flex-wrap gap-2">
												<span className="bg-accent text-accent-foreground rounded-full px-3 py-1 text-sm">
													🏷️ {entry.tagCount} tag
													{entry.tagCount !== 1 ? 's' : ''}
												</span>
											</div>

											{!isDeleted ? (
												<div className="mt-4 flex gap-2">
													<ViewEntryButton entry={entry} />
													<SummarizeEntryButton entry={entry} />
													<DeleteEntryButton
														entry={entry}
														onDeleted={() => handleEntryDeleted(entry.id)}
													/>
												</div>
											) : null}
										</div>
									</div>
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}

/**
 * X Post Link component with error boundary
 * 
 * This component allows users to post about their journal entries on X (Twitter).
 * It's wrapped in an ErrorBoundary to handle any errors gracefully.
 */
function XPostLink({ entryCount }: { entryCount: number }) {
	return (
		<ErrorBoundary FallbackComponent={XPostLinkError}>
			<XPostLinkImpl entryCount={entryCount} />
		</ErrorBoundary>
	)
}

function XPostLinkError({ error, resetErrorBoundary }: FallbackProps) {
	return (
		<div className="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border p-3">
			<p className="text-sm font-medium">Failed to post on X</p>
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
 * Implementation of X Post Link functionality
 * 
 * Uses MCP link message to open X (Twitter) with a pre-filled post about
 * the user's journal entries. This demonstrates MCP link communication.
 */
function XPostLinkImpl({ entryCount }: { entryCount: number }) {
	const [isPending, startTransition] = useTransition()
	const { showBoundary } = useErrorBoundary()
	
	/**
	 * Handles posting to X by creating a pre-filled tweet URL
	 * and sending it to the parent iframe via MCP link message
	 */
	const handlePostOnX = () => {
		startTransition(async () => {
			try {
				// Create pre-filled tweet text
				const text = `I have ${entryCount} journal ${entryCount === 1 ? 'entry' : 'entries'} in my EpicMe journal! 📝✨`
				const url = new URL('https://x.com/intent/post')
				url.searchParams.set('text', text)

				// Send link message to parent iframe (MCP agent)
				await sendMcpMessage('link', { url: url.toString() })
			} catch (err) {
				showBoundary(err)
			}
		})
	}

	return (
		<button
			onClick={handlePostOnX}
			disabled={isPending}
			className="flex cursor-pointer items-center gap-2 rounded-lg bg-black px-4 py-2 text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
		>
			<svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
			</svg>
			{isPending ? 'Posting...' : 'Post'}
		</button>
	)
}

/**
 * Delete Entry Button component with error boundary
 * 
 * This component provides a delete button for journal entries.
 * It includes double-check confirmation and error handling.
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
 * Implementation of Delete Entry Button functionality
 * 
 * Currently throws an error as tool calling for deletion is not yet implemented.
 * This demonstrates the pattern for future tool calling implementation.
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

	/**
	 * Handles entry deletion
	 * TODO: Implement actual MCP tool calling for deletion
	 */
	const handleDelete = () => {
		startTransition(async () => {
			try {
				// TODO: Replace with actual MCP tool call
				// await sendMcpMessage('tool', {
				//   toolName: 'delete_entry',
				//   params: { id: entry.id }
				// })
				throw new Error('Calling tools is not yet supported')
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
				className: `text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${
					doubleCheck
						? 'bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90'
						: 'text-destructive border-destructive/20 hover:bg-destructive/10 hover:border-destructive/40'
				} ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`,
			})}
		>
			{isPending ? 'Deleting...' : doubleCheck ? `Confirm?` : 'Delete'}
		</button>
	)
}

/**
 * View Entry Button component with error boundary
 * 
 * This component provides a button to view detailed information about a journal entry.
 * It demonstrates MCP tool calling functionality.
 */
function ViewEntryButton({ entry }: { entry: { id: number; title: string } }) {
	return (
		<ErrorBoundary FallbackComponent={ViewEntryError}>
			<ViewEntryButtonImpl entry={entry} />
		</ErrorBoundary>
	)
}

function ViewEntryError({ error, resetErrorBoundary }: FallbackProps) {
	return (
		<div className="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border p-3">
			<p className="text-sm font-medium">Failed to view entry</p>
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
 * Implementation of View Entry Button functionality
 * 
 * This demonstrates MCP tool calling by sending a 'view_entry' tool message
 * to the parent iframe (MCP agent). The agent will then call the appropriate
 * MCP tool to retrieve and display the full entry details.
 */
function ViewEntryButtonImpl({
	entry,
}: {
	entry: { id: number; title: string }
}) {
	const [isPending, startTransition] = useTransition()
	const { showBoundary } = useErrorBoundary()

	/**
	 * Handles viewing entry details by calling the MCP 'view_entry' tool
	 * This sends a tool message to the parent iframe with the entry ID
	 */
	const handleViewEntry = () => {
		startTransition(async () => {
			try {
				// Send MCP tool message to parent iframe (MCP agent)
				// The agent will call the 'view_entry' tool with the provided ID
				await sendMcpMessage('tool', {
					toolName: 'view_entry',
					params: { id: entry.id },
				})
			} catch (err) {
				showBoundary(err)
			}
		})
	}

	return (
		<button
			onClick={handleViewEntry}
			disabled={isPending}
			className="text-primary text-sm font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50"
		>
			{isPending ? 'Loading...' : 'View Details'}
		</button>
	)
}

/**
 * Summarize Entry Button component with error boundary
 * 
 * This component provides a button to summarize journal entries.
 * Currently throws an error as prompt functionality is not yet implemented.
 */
function SummarizeEntryButton({
	entry,
}: {
	entry: { id: number; title: string }
}) {
	return (
		<ErrorBoundary FallbackComponent={SummarizeEntryError}>
			<SummarizeEntryButtonImpl entry={entry} />
		</ErrorBoundary>
	)
}

function SummarizeEntryError({ error, resetErrorBoundary }: FallbackProps) {
	return (
		<div className="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border p-3">
			<p className="text-sm font-medium">Failed to summarize entry</p>
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
 * Implementation of Summarize Entry Button functionality
 * 
 * Currently throws an error as prompt functionality is not yet implemented.
 * This demonstrates the pattern for future prompt implementation.
 */
function SummarizeEntryButtonImpl({
	entry,
}: {
	entry: { id: number; title: string }
}) {
	const [isPending, startTransition] = useTransition()
	const { showBoundary } = useErrorBoundary()

	/**
	 * Handles entry summarization
	 * TODO: Implement actual MCP prompt functionality
	 */
	const handleSummarize = () => {
		startTransition(async () => {
			try {
				// TODO: Replace with actual MCP prompt call
				// await sendMcpMessage('prompt', {
				//   prompt: `Please summarize this journal entry: ${entry.title}`,
				//   context: { entryId: entry.id }
				// })
				throw new Error('Sending prompts is not yet supported')
			} catch (err) {
				showBoundary(err)
			}
		})
	}

	return (
		<button
			onClick={handleSummarize}
			disabled={isPending}
			className="text-primary text-sm font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50"
		>
			{isPending ? 'Summarizing...' : 'Summarize'}
		</button>
	)
}
