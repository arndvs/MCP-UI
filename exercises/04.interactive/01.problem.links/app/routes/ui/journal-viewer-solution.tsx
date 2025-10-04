import { useState, useTransition, useRef } from 'react'
import {
	ErrorBoundary,
	useErrorBoundary,
	type FallbackProps,
} from 'react-error-boundary'
import { sendLinkMcpMessage } from '#app/utils/mcp-solution.ts'

import { useMcpUiInit } from '#app/utils/mcp.ts'
import { useDoubleCheck } from '#app/utils/misc.ts'
import { type Route } from './+types/journal-viewer.tsx'

/**
 * Loads journal entries from the database for display in the UI.
 * This loader function runs on the server before the component renders.
 */
export async function loader({ context }: Route.LoaderArgs) {
	const entries = await context.db.getEntries()
	return { entries }
}

/**
 * Main Journal Viewer Component
 * 
 * This component displays a user's journal entries in an iframe-based MCP UI.
 * It includes functionality for:
 * - Displaying journal entries with metadata (title, tag count)
 * - Social sharing via X (Twitter) integration
 * - Entry management (view, summarize, delete)
 * - Optimistic UI updates for deleted entries
 * 
 * Key Features:
 * - Uses MCP communication for external navigation (X posting)
 * - Implements error boundaries for robust error handling
 * - Provides visual feedback for user actions (pending states, confirmations)
 * - Maintains local state for deleted entries to show immediate feedback
 */
export default function JournalViewer({ loaderData }: Route.ComponentProps) {
	const { entries } = loaderData
	
	// Track deleted entries for optimistic UI updates
	// Using Set for efficient lookups and to prevent duplicates
	const [deletedEntryIds, setDeletedEntryIds] = useState<Set<number>>(
		() => new Set([]),
	)
	
	// Ref for the root container - used by MCP UI initialization
	const rootRef = useRef<HTMLDivElement>(null)
	
	// Initialize MCP communication with parent window
	useMcpUiInit(rootRef)

	/**
	 * Handles optimistic UI updates when an entry is deleted.
	 * Immediately updates the UI to show the entry as deleted,
	 * providing instant feedback while the actual deletion happens.
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
 * X Post Link Component with Error Boundary
 * 
 * Wraps the X posting functionality in an error boundary to handle
 * any failures gracefully. If the MCP communication fails, users
 * see a helpful error message with retry option.
 */
function XPostLink({ entryCount }: { entryCount: number }) {
	return (
		<ErrorBoundary FallbackComponent={XPostLinkError}>
			<XPostLinkImpl entryCount={entryCount} />
		</ErrorBoundary>
	)
}

/**
 * Error fallback component for X posting failures.
 * Displays a user-friendly error message with retry functionality.
 */
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
 * Core X Posting Implementation
 * 
 * Handles the actual X posting functionality using MCP communication.
 * This demonstrates the key pattern for iframe-to-parent navigation:
 * 
 * 1. Constructs the X intent URL with pre-filled text
 * 2. Uses sendLinkMcpMessage to communicate with parent window
 * 3. Parent window handles the actual navigation to X
 * 4. Provides loading states and error handling
 * 
 * Why MCP Communication is Required:
 * - Iframes cannot directly navigate their parent window
 * - Regular links would navigate the iframe itself, losing control
 * - Users would lose back button functionality
 * - MCP pattern maintains seamless user experience
 */
function XPostLinkImpl({ entryCount }: { entryCount: number }) {
	const [isPending, startTransition] = useTransition()
	const { showBoundary } = useErrorBoundary()
	
	const handlePostOnX = () => {
		startTransition(async () => {
			try {
				// Construct the X intent URL with pre-filled text
				const text = `I have ${entryCount} journal ${entryCount === 1 ? 'entry' : 'entries'} in my EpicMe journal! 📝✨`
				const url = new URL('https://x.com/intent/post')
				url.searchParams.set('text', text)

				// Use MCP communication to navigate parent window to X
				// This is the key integration point - the iframe communicates
				// with the host application to handle external navigation
				await sendLinkMcpMessage(url.toString())
			} catch (err) {
				// If MCP communication fails, show error boundary
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
			{/* X (Twitter) logo SVG */}
			<svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
			</svg>
			{/* Dynamic button text based on loading state */}
			{isPending ? 'Posting...' : 'Post'}
		</button>
	)
}

/**
 * Delete Entry Button with Error Boundary
 * 
 * Provides a safe way to delete journal entries with confirmation
 * and error handling. Uses double-check pattern to prevent accidental deletions.
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
 * Delete Entry Button Implementation
 * 
 * Implements the double-check pattern for safe deletion:
 * 1. First click: Shows "Confirm?" button
 * 2. Second click: Actually performs the deletion
 * 
 * Currently shows placeholder error since tool calling isn't implemented yet.
 * This demonstrates the error boundary pattern for future tool integration.
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
		startTransition(async () => {
			try {
				// TODO: Replace with actual tool calling when implemented
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
			{/* Dynamic button text based on state */}
			{isPending ? 'Deleting...' : doubleCheck ? `Confirm?` : 'Delete'}
		</button>
	)
}

/**
 * View Entry Button Components
 * 
 * These components handle viewing journal entry details.
 * Currently shows placeholder since tool calling isn't implemented yet.
 * Demonstrates the error boundary pattern for future tool integration.
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

function ViewEntryButtonImpl({
	entry,
}: {
	entry: { id: number; title: string }
}) {
	const [isPending, startTransition] = useTransition()
	const { showBoundary } = useErrorBoundary()

	const handleViewEntry = () => {
		startTransition(async () => {
			try {
				throw new Error('Calling tools is not yet supported')
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
 * Summarize Entry Button Components
 * 
 * These components handle AI-powered summarization of journal entries.
 * Currently shows placeholder since prompt sending isn't implemented yet.
 * Demonstrates the error boundary pattern for future prompt integration.
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

function SummarizeEntryButtonImpl({
	entry,
}: {
	entry: { id: number; title: string }
}) {
	const [isPending, startTransition] = useTransition()
	const { showBoundary } = useErrorBoundary()

	const handleSummarize = () => {
		startTransition(async () => {
			try {
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
